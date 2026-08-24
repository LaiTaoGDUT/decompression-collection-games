param(
    [string]$Endpoint = $(
        if ($env:COCOS_MCP_HTTP_URL) {
            $env:COCOS_MCP_HTTP_URL
        } else {
            'http://127.0.0.1:3001/mcp'
        }
    )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Net.Http

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.UseProxy = $false
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(180)

function Write-ProtocolMessage {
    param([Parameter(Mandatory = $true)][string]$Json)

    [Console]::Out.WriteLine($Json)
    [Console]::Out.Flush()
}

function ConvertTo-ProtocolJson {
    param([Parameter(Mandatory = $true)]$Value)

    return $Value | ConvertTo-Json -Compress -Depth 100
}

function New-JsonRpcError {
    param(
        $Id,
        [int]$Code,
        [string]$Message
    )

    return ConvertTo-ProtocolJson ([ordered]@{
        jsonrpc = '2.0'
        id = $Id
        error = [ordered]@{
            code = $Code
            message = $Message
        }
    })
}

function Get-HealthEndpoint {
    if ($Endpoint.EndsWith('/mcp', [System.StringComparison]::OrdinalIgnoreCase)) {
        return $Endpoint.Substring(0, $Endpoint.Length - 4) + '/health'
    }

    return $Endpoint.TrimEnd('/') + '/health'
}

function Assert-CocosServerReady {
    $healthEndpoint = Get-HealthEndpoint
    $response = $client.GetAsync($healthEndpoint).GetAwaiter().GetResult()

    try {
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "health check returned HTTP $([int]$response.StatusCode): $body"
        }

        $health = $body | ConvertFrom-Json
        if ($health.status -ne 'ok') {
            throw "health check returned an unexpected status: $body"
        }
    } finally {
        $response.Dispose()
    }
}

function Invoke-CocosMcpRequest {
    param([Parameter(Mandatory = $true)][string]$Json)

    $request = New-Object System.Net.Http.HttpRequestMessage(
        [System.Net.Http.HttpMethod]::Post,
        $Endpoint
    )
    $request.Content = New-Object System.Net.Http.StringContent(
        $Json,
        [System.Text.Encoding]::UTF8,
        'application/json'
    )
    $request.Headers.Accept.ParseAdd('application/json')

    try {
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        try {
            $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            if (-not $response.IsSuccessStatusCode) {
                throw "Cocos MCP returned HTTP $([int]$response.StatusCode): $body"
            }
            if ([string]::IsNullOrWhiteSpace($body)) {
                throw 'Cocos MCP returned an empty response'
            }

            # Validate the payload, while preserving the plugin's original compact JSON.
            $null = $body | ConvertFrom-Json
            return $body.Trim()
        } finally {
            $response.Dispose()
        }
    } finally {
        $request.Dispose()
    }
}

function Get-RequestId {
    param($Message)

    if ($Message.PSObject.Properties.Name -contains 'id') {
        return $Message.id
    }

    return $null
}

try {
    while (($line = [Console]::In.ReadLine()) -ne $null) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $message = $null
        $id = $null

        try {
            $message = $line | ConvertFrom-Json
            $id = Get-RequestId $message
            $hasId = $message.PSObject.Properties.Name -contains 'id'
            $method = [string]$message.method

            if (-not $method) {
                Write-ProtocolMessage (New-JsonRpcError $id -32600 'Invalid Request: method is required')
                continue
            }

            if (-not $hasId) {
                # The bundled Cocos plugin incorrectly replies to MCP notifications.
                # Swallow them here so the STDIO side remains protocol compliant.
                continue
            }

            switch ($method) {
                'initialize' {
                    Assert-CocosServerReady

                    $requestedVersion = [string]$message.params.protocolVersion
                    $supportedVersions = @('2025-06-18', '2025-03-26', '2024-11-05')
                    $protocolVersion = if ($supportedVersions -contains $requestedVersion) {
                        $requestedVersion
                    } else {
                        '2025-06-18'
                    }

                    $result = [ordered]@{
                        protocolVersion = $protocolVersion
                        capabilities = [ordered]@{
                            tools = [ordered]@{
                                listChanged = $false
                            }
                        }
                        serverInfo = [ordered]@{
                            name = 'cocos-creator-stdio-bridge'
                            version = '1.0.0'
                        }
                        instructions = 'Keep Cocos Creator open with the project MCP server running on port 3001. Use the exposed tools for editor operations.'
                    }

                    Write-ProtocolMessage (ConvertTo-ProtocolJson ([ordered]@{
                        jsonrpc = '2.0'
                        id = $id
                        result = $result
                    }))
                }
                'ping' {
                    Write-ProtocolMessage (ConvertTo-ProtocolJson ([ordered]@{
                        jsonrpc = '2.0'
                        id = $id
                        result = [ordered]@{}
                    }))
                }
                'tools/list' {
                    Write-ProtocolMessage (Invoke-CocosMcpRequest $line)
                }
                'tools/call' {
                    Write-ProtocolMessage (Invoke-CocosMcpRequest $line)
                }
                default {
                    Write-ProtocolMessage (New-JsonRpcError $id -32601 "Method not found: $method")
                }
            }
        } catch {
            $errorMessage = "Cocos Creator MCP bridge error: $($_.Exception.Message)"
            Write-ProtocolMessage (New-JsonRpcError $id -32603 $errorMessage)
        }
    }
} finally {
    $client.Dispose()
    $handler.Dispose()
}
