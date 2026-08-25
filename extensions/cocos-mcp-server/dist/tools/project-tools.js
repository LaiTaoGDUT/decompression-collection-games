"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectTools = void 0;
class ProjectTools {
    getTools() {
        return [
            {
                name: 'project_manage',
                description: 'PROJECT MANAGEMENT: Core project operations and configuration. COMMON WORKFLOWS: get_info for project details, run for preview testing, build for deployment preparation, get_settings for configuration inspection. Browser and simulator preview use the editor preview runtime directly; build operations still require manual interaction due to API limitations.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['run', 'reload', 'build', 'get_info', 'get_settings'],
                            description: 'Project operation: "run" = start or reuse preview/testing (requires platform) | "reload" = refresh an existing browser/simulator preview without opening a new tab | "build" = prepare for deployment (requires buildPlatform) | "get_info" = project metadata and paths | "get_settings" = configuration by category (requires category)'
                        },
                        // For run/reload actions
                        platform: {
                            type: 'string',
                            enum: ['browser', 'simulator', 'preview'],
                            description: 'Preview platform (run/reload action). "browser" = start or reuse Cocos browser preview, "simulator" = device simulation, "preview" = editor Game View preview. Browser preview is equivalent to clicking the top toolbar Run button with Browser selected.',
                            default: 'browser'
                        },
                        // For build action
                        buildPlatform: {
                            type: 'string',
                            enum: ['web-mobile', 'web-desktop', 'ios', 'android', 'windows', 'mac'],
                            description: 'Target deployment platform (REQUIRED for build action). "web-mobile" = mobile web, "web-desktop" = desktop web, "ios" = iPhone/iPad, "android" = Android devices, "windows" = Windows desktop, "mac" = macOS desktop.'
                        },
                        debug: {
                            type: 'boolean',
                            description: 'Build configuration (build action). true = development build with debug info and source maps (larger size, easier debugging), false = optimized production build (smaller size, harder debugging). Recommended: true for testing.',
                            default: true
                        },
                        // For get_settings action
                        category: {
                            type: 'string',
                            enum: ['general', 'physics', 'render', 'assets'],
                            description: 'Configuration category (get_settings action). "general" = basic project settings, "physics" = physics engine config, "render" = rendering settings, "assets" = asset processing. Default: general for basic info.',
                            default: 'general'
                        }
                    },
                    required: ['action']
                }
            },
            {
                name: 'project_build_system',
                description: 'BUILD SYSTEM: Control build panel, check builder status, and manage preview servers. Use this for build-related operations and preview management.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['get_build_settings', 'open_build_panel', 'check_builder_status'],
                            description: 'Build system action to perform'
                        }
                    },
                    required: ['action']
                }
            }
        ];
    }
    async execute(toolName, args) {
        switch (toolName) {
            case 'project_manage':
                return await this.handleProjectManage(args);
            case 'project_build_system':
                return await this.handleBuildSystem(args);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }
    // New consolidated handlers
    async handleProjectManage(args) {
        const { action } = args;
        switch (action) {
            case 'run':
                return await this.runProject(args.platform);
            case 'reload':
                return await this.reloadPreview(args.platform);
            case 'build':
                return await this.buildProject({ platform: args.buildPlatform, debug: args.debug });
            case 'get_info':
                return await this.getProjectInfo();
            case 'get_settings':
                return await this.getProjectSettings(args.category);
            default:
                return { success: false, error: `Unknown project manage action: ${action}` };
        }
    }
    async handleBuildSystem(args) {
        const { action } = args;
        switch (action) {
            case 'get_build_settings':
                return await this.getBuildSettings();
            case 'open_build_panel':
                return await this.openBuildPanel();
            case 'check_builder_status':
                return await this.checkBuilderStatus();
            default:
                return { success: false, error: `Unknown build system action: ${action}` };
        }
    }
    // Original implementation methods
    async runProject(platform = 'browser') {
        const supportedPlatforms = ['browser', 'simulator', 'preview'];
        if (!supportedPlatforms.includes(platform)) {
            return {
                success: false,
                error: `Unsupported preview platform: ${platform}. Supported platforms: ${supportedPlatforms.join(', ')}`
            };
        }
        try {
            if (platform === 'preview') {
                const isPlaying = await Editor.Message.request('scene', 'editor-preview-set-play', true);
                return {
                    success: Boolean(isPlaying),
                    message: isPlaying
                        ? '✅ Cocos editor Game View preview started'
                        : '⚠️ Cocos editor Game View preview did not start',
                    data: {
                        platform,
                        isPlaying: Boolean(isPlaying)
                    }
                };
            }
            // This mirrors the Preview toolbar's platform switch before it calls
            // preview.open-terminal. Unlike builder.open, open-terminal starts
            // the actual Cocos preview server and opens/reuses the browser.
            await Editor.Profile.setConfig('preview', 'preview.current.platform', platform, 'local');
            Editor.Message.send('preview', 'change-platform', platform);
            // query-preview-url is the least invasive way to detect whether the
            // preview service is already available. Calling open-terminal every
            // time starts/reuses the service but also asks Creator to open a new
            // browser tab, so only call it when no URL is available yet.
            let previewUrl = await this.queryPreviewUrl();
            const reused = Boolean(previewUrl);
            if (!reused) {
                await Editor.Message.request('preview', 'open-terminal', undefined);
                previewUrl = await this.queryPreviewUrl();
            }
            return {
                success: true,
                message: platform === 'browser'
                    ? reused
                        ? '✅ Existing Cocos browser preview service reused (no new tab opened)'
                        : '✅ Cocos browser preview started (equivalent to the top toolbar Run button)'
                    : reused
                        ? '✅ Existing Cocos simulator preview service reused'
                        : '✅ Cocos simulator preview started',
                data: Object.assign({ platform,
                    reused }, (previewUrl ? { previewUrl } : {}))
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async queryPreviewUrl() {
        try {
            const previewUrl = await Editor.Message.request('preview', 'query-preview-url');
            return typeof previewUrl === 'string' && previewUrl.trim().length > 0
                ? previewUrl
                : undefined;
        }
        catch (_a) {
            // Older Creator versions may not expose query-preview-url or may
            // reject it while the preview service is not running.
            return undefined;
        }
    }
    async reloadPreview(platform = 'browser') {
        const supportedPlatforms = ['browser', 'simulator'];
        if (!supportedPlatforms.includes(platform)) {
            return {
                success: false,
                error: `Reload is only supported for browser or simulator previews. Received: ${platform}`
            };
        }
        try {
            const previewUrl = await this.queryPreviewUrl();
            if (!previewUrl) {
                return {
                    success: false,
                    error: 'No active Cocos preview service was found. Call project_manage with action "run" first.'
                };
            }
            // reload-terminal refreshes existing preview pages and does not
            // launch another browser tab.
            Editor.Message.send('preview', 'reload-terminal');
            return {
                success: true,
                message: platform === 'browser'
                    ? '✅ Existing Cocos browser preview reloaded without opening a new tab'
                    : '✅ Existing Cocos simulator preview reloaded',
                data: {
                    platform,
                    previewUrl,
                    reused: true
                }
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async buildProject(args) {
        const buildOptions = {
            platform: args.platform,
            debug: args.debug !== false,
            sourceMaps: args.debug !== false,
            buildPath: `build/${args.platform}`
        };
        // Note: Builder module only supports 'open' and 'query-worker-ready'
        // Building requires manual interaction through the build panel
        try {
            await Editor.Message.request('builder', 'open');
            return {
                success: true,
                message: `✅ Build panel opened for ${args.platform}. Please configure and start build manually.`,
                data: {
                    platform: args.platform,
                    debug: args.debug,
                    instruction: "Use the build panel to configure and start the build process",
                    buildOptions
                }
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async getProjectInfo() {
        var _a;
        const info = {
            name: Editor.Project.name,
            path: Editor.Project.path,
            uuid: Editor.Project.uuid,
            version: Editor.Project.version || '1.0.0',
            cocosVersion: ((_a = Editor.versions) === null || _a === void 0 ? void 0 : _a.cocos) || 'Unknown'
        };
        // Note: 'query-info' API doesn't exist, using 'query-config' instead
        try {
            const additionalInfo = await Editor.Message.request('project', 'query-config', 'project');
            if (additionalInfo) {
                Object.assign(info, { config: additionalInfo });
            }
            return {
                success: true,
                message: `✅ Project info retrieved: ${info.name}`,
                data: info
            };
        }
        catch (_b) {
            // Return basic info even if detailed query fails
            return {
                success: true,
                message: `✅ Basic project info retrieved: ${info.name}`,
                data: info
            };
        }
    }
    async getProjectSettings(category = 'general') {
        const configMap = {
            general: 'project',
            physics: 'physics',
            render: 'render',
            assets: 'asset-db'
        };
        const configName = configMap[category] || 'project';
        try {
            const settings = await Editor.Message.request('project', 'query-config', configName);
            return {
                success: true,
                message: `✅ ${category} settings retrieved successfully`,
                data: {
                    category: category,
                    config: settings
                }
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async getBuildSettings() {
        try {
            const ready = await Editor.Message.request('builder', 'query-worker-ready');
            return {
                success: true,
                message: `✅ Build settings status retrieved`,
                data: {
                    builderReady: ready,
                    message: 'Build settings are limited in MCP plugin environment',
                    availableActions: [
                        'Open build panel with project_build_system action "open_build_panel"',
                        'Check builder status with project_build_system action "check_builder_status"'
                    ],
                    limitation: 'Full build configuration requires direct Editor UI access'
                }
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async openBuildPanel() {
        try {
            await Editor.Message.request('builder', 'open');
            return {
                success: true,
                message: '✅ Build panel opened successfully'
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async checkBuilderStatus() {
        try {
            const ready = await Editor.Message.request('builder', 'query-worker-ready');
            return {
                success: true,
                message: '✅ Builder status checked successfully',
                data: {
                    ready: ready,
                    status: ready ? 'Builder worker is ready' : 'Builder worker is not ready'
                }
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
}
exports.ProjectTools = ProjectTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvamVjdC10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9wcm9qZWN0LXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUVBLE1BQWEsWUFBWTtJQUNyQixRQUFRO1FBQ0osT0FBTztZQUNIO2dCQUNJLElBQUksRUFBRSxnQkFBZ0I7Z0JBQ3RCLFdBQVcsRUFBRSx1V0FBdVc7Z0JBQ3BYLFdBQVcsRUFBRTtvQkFDVCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1IsTUFBTSxFQUFFOzRCQUNKLElBQUksRUFBRSxRQUFROzRCQUNkLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxjQUFjLENBQUM7NEJBQzVELFdBQVcsRUFBRSwyVUFBMlU7eUJBQzNWO3dCQUNELHlCQUF5Qjt3QkFDekIsUUFBUSxFQUFFOzRCQUNOLElBQUksRUFBRSxRQUFROzRCQUNkLElBQUksRUFBRSxDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsU0FBUyxDQUFDOzRCQUN6QyxXQUFXLEVBQUUsNFBBQTRQOzRCQUN6USxPQUFPLEVBQUUsU0FBUzt5QkFDckI7d0JBQ0QsbUJBQW1CO3dCQUNuQixhQUFhLEVBQUU7NEJBQ1gsSUFBSSxFQUFFLFFBQVE7NEJBQ2QsSUFBSSxFQUFFLENBQUMsWUFBWSxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUM7NEJBQ3ZFLFdBQVcsRUFBRSx1TkFBdU47eUJBQ3ZPO3dCQUNELEtBQUssRUFBRTs0QkFDSCxJQUFJLEVBQUUsU0FBUzs0QkFDZixXQUFXLEVBQUUsbU9BQW1POzRCQUNoUCxPQUFPLEVBQUUsSUFBSTt5QkFDaEI7d0JBQ0QsMEJBQTBCO3dCQUMxQixRQUFRLEVBQUU7NEJBQ04sSUFBSSxFQUFFLFFBQVE7NEJBQ2QsSUFBSSxFQUFFLENBQUMsU0FBUyxFQUFF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QUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVPLEtBQUssQ0FBQyxrQkFBa0I7UUFDNUIsSUFBSSxDQUFDO1lBQ0QsTUFBTSxLQUFLLEdBQVksTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUNyRixPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLE9BQU8sRUFBRSx1Q0FBdUM7Z0JBQ2hELElBQUksRUFBRTtvQkFDRixLQUFLLEVBQUUsS0FBSztvQkFDWixNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsNkJBQTZCO2lCQUM1RTthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0NBRUo7QUFqV0Qsb0NBaVdDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQcm9qZWN0SW5mbyB9IGZyb20gJy4uL3R5cGVzJztcblxuZXhwb3J0IGNsYXNzIFByb2plY3RUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3Byb2plY3RfbWFuYWdlJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1BST0pFQ1QgTUFOQUdFTUVOVDogQ29yZSBwcm9qZWN0IG9wZXJhdGlvbnMgYW5kIGNvbmZpZ3VyYXRpb24uIENPTU1PTiBXT1JLRkxPV1M6IGdldF9pbmZvIGZvciBwcm9qZWN0IGRldGFpbHMsIHJ1biBmb3IgcHJldmlldyB0ZXN0aW5nLCBidWlsZCBmb3IgZGVwbG95bWVudCBwcmVwYXJhdGlvbiwgZ2V0X3NldHRpbmdzIGZvciBjb25maWd1cmF0aW9uIGluc3BlY3Rpb24uIEJyb3dzZXIgYW5kIHNpbXVsYXRvciBwcmV2aWV3IHVzZSB0aGUgZWRpdG9yIHByZXZpZXcgcnVudGltZSBkaXJlY3RseTsgYnVpbGQgb3BlcmF0aW9ucyBzdGlsbCByZXF1aXJlIG1hbnVhbCBpbnRlcmFjdGlvbiBkdWUgdG8gQVBJIGxpbWl0YXRpb25zLicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudW06IFsncnVuJywgJ3JlbG9hZCcsICdidWlsZCcsICdnZXRfaW5mbycsICdnZXRfc2V0dGluZ3MnXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1Byb2plY3Qgb3BlcmF0aW9uOiBcInJ1blwiID0gc3RhcnQgb3IgcmV1c2UgcHJldmlldy90ZXN0aW5nIChyZXF1aXJlcyBwbGF0Zm9ybSkgfCBcInJlbG9hZFwiID0gcmVmcmVzaCBhbiBleGlzdGluZyBicm93c2VyL3NpbXVsYXRvciBwcmV2aWV3IHdpdGhvdXQgb3BlbmluZyBhIG5ldyB0YWIgfCBcImJ1aWxkXCIgPSBwcmVwYXJlIGZvciBkZXBsb3ltZW50IChyZXF1aXJlcyBidWlsZFBsYXRmb3JtKSB8IFwiZ2V0X2luZm9cIiA9IHByb2plY3QgbWV0YWRhdGEgYW5kIHBhdGhzIHwgXCJnZXRfc2V0dGluZ3NcIiA9IGNvbmZpZ3VyYXRpb24gYnkgY2F0ZWdvcnkgKHJlcXVpcmVzIGNhdGVnb3J5KSdcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3IgcnVuL3JlbG9hZCBhY3Rpb25zXG4gICAgICAgICAgICAgICAgICAgICAgICBwbGF0Zm9ybToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudW06IFsnYnJvd3NlcicsICdzaW11bGF0b3InLCAncHJldmlldyddLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUHJldmlldyBwbGF0Zm9ybSAocnVuL3JlbG9hZCBhY3Rpb24pLiBcImJyb3dzZXJcIiA9IHN0YXJ0IG9yIHJldXNlIENvY29zIGJyb3dzZXIgcHJldmlldywgXCJzaW11bGF0b3JcIiA9IGRldmljZSBzaW11bGF0aW9uLCBcInByZXZpZXdcIiA9IGVkaXRvciBHYW1lIFZpZXcgcHJldmlldy4gQnJvd3NlciBwcmV2aWV3IGlzIGVxdWl2YWxlbnQgdG8gY2xpY2tpbmcgdGhlIHRvcCB0b29sYmFyIFJ1biBidXR0b24gd2l0aCBCcm93c2VyIHNlbGVjdGVkLicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDogJ2Jyb3dzZXInXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGJ1aWxkIGFjdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgYnVpbGRQbGF0Zm9ybToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudW06IFsnd2ViLW1vYmlsZScsICd3ZWItZGVza3RvcCcsICdpb3MnLCAnYW5kcm9pZCcsICd3aW5kb3dzJywgJ21hYyddLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGFyZ2V0IGRlcGxveW1lbnQgcGxhdGZvcm0gKFJFUVVJUkVEIGZvciBidWlsZCBhY3Rpb24pLiBcIndlYi1tb2JpbGVcIiA9IG1vYmlsZSB3ZWIsIFwid2ViLWRlc2t0b3BcIiA9IGRlc2t0b3Agd2ViLCBcImlvc1wiID0gaVBob25lL2lQYWQsIFwiYW5kcm9pZFwiID0gQW5kcm9pZCBkZXZpY2VzLCBcIndpbmRvd3NcIiA9IFdpbmRvd3MgZGVza3RvcCwgXCJtYWNcIiA9IG1hY09TIGRlc2t0b3AuJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQnVpbGQgY29uZmlndXJhdGlvbiAoYnVpbGQgYWN0aW9uKS4gdHJ1ZSA9IGRldmVsb3BtZW50IGJ1aWxkIHdpdGggZGVidWcgaW5mbyBhbmQgc291cmNlIG1hcHMgKGxhcmdlciBzaXplLCBlYXNpZXIgZGVidWdnaW5nKSwgZmFsc2UgPSBvcHRpbWl6ZWQgcHJvZHVjdGlvbiBidWlsZCAoc21hbGxlciBzaXplLCBoYXJkZXIgZGVidWdnaW5nKS4gUmVjb21tZW5kZWQ6IHRydWUgZm9yIHRlc3RpbmcuJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGdldF9zZXR0aW5ncyBhY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW51bTogWydnZW5lcmFsJywgJ3BoeXNpY3MnLCAncmVuZGVyJywgJ2Fzc2V0cyddLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ29uZmlndXJhdGlvbiBjYXRlZ29yeSAoZ2V0X3NldHRpbmdzIGFjdGlvbikuIFwiZ2VuZXJhbFwiID0gYmFzaWMgcHJvamVjdCBzZXR0aW5ncywgXCJwaHlzaWNzXCIgPSBwaHlzaWNzIGVuZ2luZSBjb25maWcsIFwicmVuZGVyXCIgPSByZW5kZXJpbmcgc2V0dGluZ3MsIFwiYXNzZXRzXCIgPSBhc3NldCBwcm9jZXNzaW5nLiBEZWZhdWx0OiBnZW5lcmFsIGZvciBiYXNpYyBpbmZvLicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDogJ2dlbmVyYWwnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVkOiBbJ2FjdGlvbiddXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAncHJvamVjdF9idWlsZF9zeXN0ZW0nLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQlVJTEQgU1lTVEVNOiBDb250cm9sIGJ1aWxkIHBhbmVsLCBjaGVjayBidWlsZGVyIHN0YXR1cywgYW5kIG1hbmFnZSBwcmV2aWV3IHNlcnZlcnMuIFVzZSB0aGlzIGZvciBidWlsZC1yZWxhdGVkIG9wZXJhdGlvbnMgYW5kIHByZXZpZXcgbWFuYWdlbWVudC4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnVtOiBbJ2dldF9idWlsZF9zZXR0aW5ncycsICdvcGVuX2J1aWxkX3BhbmVsJywgJ2NoZWNrX2J1aWxkZXJfc3RhdHVzJ10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdCdWlsZCBzeXN0ZW0gYWN0aW9uIHRvIHBlcmZvcm0nXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVkOiBbJ2FjdGlvbiddXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGFzeW5jIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgc3dpdGNoICh0b29sTmFtZSkge1xuICAgICAgICAgICAgY2FzZSAncHJvamVjdF9tYW5hZ2UnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmhhbmRsZVByb2plY3RNYW5hZ2UoYXJncyk7XG4gICAgICAgICAgICBjYXNlICdwcm9qZWN0X2J1aWxkX3N5c3RlbSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuaGFuZGxlQnVpbGRTeXN0ZW0oYXJncyk7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b29sOiAke3Rvb2xOYW1lfWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gTmV3IGNvbnNvbGlkYXRlZCBoYW5kbGVyc1xuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlUHJvamVjdE1hbmFnZShhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB7IGFjdGlvbiB9ID0gYXJncztcbiAgICAgICAgXG4gICAgICAgIHN3aXRjaCAoYWN0aW9uKSB7XG4gICAgICAgICAgICBjYXNlICdydW4nOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnJ1blByb2plY3QoYXJncy5wbGF0Zm9ybSk7XG4gICAgICAgICAgICBjYXNlICdyZWxvYWQnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLnJlbG9hZFByZXZpZXcoYXJncy5wbGF0Zm9ybSk7XG4gICAgICAgICAgICBjYXNlICdidWlsZCc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuYnVpbGRQcm9qZWN0KHsgcGxhdGZvcm06IGFyZ3MuYnVpbGRQbGF0Zm9ybSwgZGVidWc6IGFyZ3MuZGVidWcgfSk7XG4gICAgICAgICAgICBjYXNlICdnZXRfaW5mbyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UHJvamVjdEluZm8oKTtcbiAgICAgICAgICAgIGNhc2UgJ2dldF9zZXR0aW5ncyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UHJvamVjdFNldHRpbmdzKGFyZ3MuY2F0ZWdvcnkpO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBVbmtub3duIHByb2plY3QgbWFuYWdlIGFjdGlvbjogJHthY3Rpb259YCB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVCdWlsZFN5c3RlbShhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCB7IGFjdGlvbiB9ID0gYXJncztcbiAgICAgICAgXG4gICAgICAgIHN3aXRjaCAoYWN0aW9uKSB7XG4gICAgICAgICAgICBjYXNlICdnZXRfYnVpbGRfc2V0dGluZ3MnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldEJ1aWxkU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIGNhc2UgJ29wZW5fYnVpbGRfcGFuZWwnOlxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLm9wZW5CdWlsZFBhbmVsKCk7XG4gICAgICAgICAgICBjYXNlICdjaGVja19idWlsZGVyX3N0YXR1cyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuY2hlY2tCdWlsZGVyU3RhdHVzKCk7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFVua25vd24gYnVpbGQgc3lzdGVtIGFjdGlvbjogJHthY3Rpb259YCB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gT3JpZ2luYWwgaW1wbGVtZW50YXRpb24gbWV0aG9kc1xuICAgIHByaXZhdGUgYXN5bmMgcnVuUHJvamVjdChwbGF0Zm9ybTogc3RyaW5nID0gJ2Jyb3dzZXInKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc3VwcG9ydGVkUGxhdGZvcm1zID0gWydicm93c2VyJywgJ3NpbXVsYXRvcicsICdwcmV2aWV3J107XG5cbiAgICAgICAgaWYgKCFzdXBwb3J0ZWRQbGF0Zm9ybXMuaW5jbHVkZXMocGxhdGZvcm0pKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBgVW5zdXBwb3J0ZWQgcHJldmlldyBwbGF0Zm9ybTogJHtwbGF0Zm9ybX0uIFN1cHBvcnRlZCBwbGF0Zm9ybXM6ICR7c3VwcG9ydGVkUGxhdGZvcm1zLmpvaW4oJywgJyl9YFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAocGxhdGZvcm0gPT09ICdwcmV2aWV3Jykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzUGxheWluZyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2VkaXRvci1wcmV2aWV3LXNldC1wbGF5JywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogQm9vbGVhbihpc1BsYXlpbmcpLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBpc1BsYXlpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgID8gJ+KchSBDb2NvcyBlZGl0b3IgR2FtZSBWaWV3IHByZXZpZXcgc3RhcnRlZCdcbiAgICAgICAgICAgICAgICAgICAgICAgIDogJ+KaoO+4jyBDb2NvcyBlZGl0b3IgR2FtZSBWaWV3IHByZXZpZXcgZGlkIG5vdCBzdGFydCcsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBsYXRmb3JtLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNQbGF5aW5nOiBCb29sZWFuKGlzUGxheWluZylcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRoaXMgbWlycm9ycyB0aGUgUHJldmlldyB0b29sYmFyJ3MgcGxhdGZvcm0gc3dpdGNoIGJlZm9yZSBpdCBjYWxsc1xuICAgICAgICAgICAgLy8gcHJldmlldy5vcGVuLXRlcm1pbmFsLiBVbmxpa2UgYnVpbGRlci5vcGVuLCBvcGVuLXRlcm1pbmFsIHN0YXJ0c1xuICAgICAgICAgICAgLy8gdGhlIGFjdHVhbCBDb2NvcyBwcmV2aWV3IHNlcnZlciBhbmQgb3BlbnMvcmV1c2VzIHRoZSBicm93c2VyLlxuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLlByb2ZpbGUuc2V0Q29uZmlnKCdwcmV2aWV3JywgJ3ByZXZpZXcuY3VycmVudC5wbGF0Zm9ybScsIHBsYXRmb3JtLCAnbG9jYWwnKTtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3ByZXZpZXcnLCAnY2hhbmdlLXBsYXRmb3JtJywgcGxhdGZvcm0pO1xuXG4gICAgICAgICAgICAvLyBxdWVyeS1wcmV2aWV3LXVybCBpcyB0aGUgbGVhc3QgaW52YXNpdmUgd2F5IHRvIGRldGVjdCB3aGV0aGVyIHRoZVxuICAgICAgICAgICAgLy8gcHJldmlldyBzZXJ2aWNlIGlzIGFscmVhZHkgYXZhaWxhYmxlLiBDYWxsaW5nIG9wZW4tdGVybWluYWwgZXZlcnlcbiAgICAgICAgICAgIC8vIHRpbWUgc3RhcnRzL3JldXNlcyB0aGUgc2VydmljZSBidXQgYWxzbyBhc2tzIENyZWF0b3IgdG8gb3BlbiBhIG5ld1xuICAgICAgICAgICAgLy8gYnJvd3NlciB0YWIsIHNvIG9ubHkgY2FsbCBpdCB3aGVuIG5vIFVSTCBpcyBhdmFpbGFibGUgeWV0LlxuICAgICAgICAgICAgbGV0IHByZXZpZXdVcmwgPSBhd2FpdCB0aGlzLnF1ZXJ5UHJldmlld1VybCgpO1xuICAgICAgICAgICAgY29uc3QgcmV1c2VkID0gQm9vbGVhbihwcmV2aWV3VXJsKTtcbiAgICAgICAgICAgIGlmICghcmV1c2VkKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJldmlldycsICdvcGVuLXRlcm1pbmFsJywgdW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICBwcmV2aWV3VXJsID0gYXdhaXQgdGhpcy5xdWVyeVByZXZpZXdVcmwoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHBsYXRmb3JtID09PSAnYnJvd3NlcidcbiAgICAgICAgICAgICAgICAgICAgPyByZXVzZWRcbiAgICAgICAgICAgICAgICAgICAgICAgID8gJ+KchSBFeGlzdGluZyBDb2NvcyBicm93c2VyIHByZXZpZXcgc2VydmljZSByZXVzZWQgKG5vIG5ldyB0YWIgb3BlbmVkKSdcbiAgICAgICAgICAgICAgICAgICAgICAgIDogJ+KchSBDb2NvcyBicm93c2VyIHByZXZpZXcgc3RhcnRlZCAoZXF1aXZhbGVudCB0byB0aGUgdG9wIHRvb2xiYXIgUnVuIGJ1dHRvbiknXG4gICAgICAgICAgICAgICAgICAgIDogcmV1c2VkXG4gICAgICAgICAgICAgICAgICAgICAgICA/ICfinIUgRXhpc3RpbmcgQ29jb3Mgc2ltdWxhdG9yIHByZXZpZXcgc2VydmljZSByZXVzZWQnXG4gICAgICAgICAgICAgICAgICAgICAgICA6ICfinIUgQ29jb3Mgc2ltdWxhdG9yIHByZXZpZXcgc3RhcnRlZCcsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBwbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICAgICAgcmV1c2VkLFxuICAgICAgICAgICAgICAgICAgICAuLi4ocHJldmlld1VybCA/IHsgcHJldmlld1VybCB9IDoge30pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlQcmV2aWV3VXJsKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcmV2aWV3VXJsID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJldmlldycsICdxdWVyeS1wcmV2aWV3LXVybCcpO1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiBwcmV2aWV3VXJsID09PSAnc3RyaW5nJyAmJiBwcmV2aWV3VXJsLnRyaW0oKS5sZW5ndGggPiAwXG4gICAgICAgICAgICAgICAgPyBwcmV2aWV3VXJsXG4gICAgICAgICAgICAgICAgOiB1bmRlZmluZWQ7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gT2xkZXIgQ3JlYXRvciB2ZXJzaW9ucyBtYXkgbm90IGV4cG9zZSBxdWVyeS1wcmV2aWV3LXVybCBvciBtYXlcbiAgICAgICAgICAgIC8vIHJlamVjdCBpdCB3aGlsZSB0aGUgcHJldmlldyBzZXJ2aWNlIGlzIG5vdCBydW5uaW5nLlxuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVsb2FkUHJldmlldyhwbGF0Zm9ybTogc3RyaW5nID0gJ2Jyb3dzZXInKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3Qgc3VwcG9ydGVkUGxhdGZvcm1zID0gWydicm93c2VyJywgJ3NpbXVsYXRvciddO1xuXG4gICAgICAgIGlmICghc3VwcG9ydGVkUGxhdGZvcm1zLmluY2x1ZGVzKHBsYXRmb3JtKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBlcnJvcjogYFJlbG9hZCBpcyBvbmx5IHN1cHBvcnRlZCBmb3IgYnJvd3NlciBvciBzaW11bGF0b3IgcHJldmlld3MuIFJlY2VpdmVkOiAke3BsYXRmb3JtfWBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJldmlld1VybCA9IGF3YWl0IHRoaXMucXVlcnlQcmV2aWV3VXJsKCk7XG4gICAgICAgICAgICBpZiAoIXByZXZpZXdVcmwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICdObyBhY3RpdmUgQ29jb3MgcHJldmlldyBzZXJ2aWNlIHdhcyBmb3VuZC4gQ2FsbCBwcm9qZWN0X21hbmFnZSB3aXRoIGFjdGlvbiBcInJ1blwiIGZpcnN0LidcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyByZWxvYWQtdGVybWluYWwgcmVmcmVzaGVzIGV4aXN0aW5nIHByZXZpZXcgcGFnZXMgYW5kIGRvZXMgbm90XG4gICAgICAgICAgICAvLyBsYXVuY2ggYW5vdGhlciBicm93c2VyIHRhYi5cbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3ByZXZpZXcnLCAncmVsb2FkLXRlcm1pbmFsJyk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBwbGF0Zm9ybSA9PT0gJ2Jyb3dzZXInXG4gICAgICAgICAgICAgICAgICAgID8gJ+KchSBFeGlzdGluZyBDb2NvcyBicm93c2VyIHByZXZpZXcgcmVsb2FkZWQgd2l0aG91dCBvcGVuaW5nIGEgbmV3IHRhYidcbiAgICAgICAgICAgICAgICAgICAgOiAn4pyFIEV4aXN0aW5nIENvY29zIHNpbXVsYXRvciBwcmV2aWV3IHJlbG9hZGVkJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHBsYXRmb3JtLFxuICAgICAgICAgICAgICAgICAgICBwcmV2aWV3VXJsLFxuICAgICAgICAgICAgICAgICAgICByZXVzZWQ6IHRydWVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBidWlsZFByb2plY3QoYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgYnVpbGRPcHRpb25zID0ge1xuICAgICAgICAgICAgcGxhdGZvcm06IGFyZ3MucGxhdGZvcm0sXG4gICAgICAgICAgICBkZWJ1ZzogYXJncy5kZWJ1ZyAhPT0gZmFsc2UsXG4gICAgICAgICAgICBzb3VyY2VNYXBzOiBhcmdzLmRlYnVnICE9PSBmYWxzZSxcbiAgICAgICAgICAgIGJ1aWxkUGF0aDogYGJ1aWxkLyR7YXJncy5wbGF0Zm9ybX1gXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gTm90ZTogQnVpbGRlciBtb2R1bGUgb25seSBzdXBwb3J0cyAnb3BlbicgYW5kICdxdWVyeS13b3JrZXItcmVhZHknXG4gICAgICAgIC8vIEJ1aWxkaW5nIHJlcXVpcmVzIG1hbnVhbCBpbnRlcmFjdGlvbiB0aHJvdWdoIHRoZSBidWlsZCBwYW5lbFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYnVpbGRlcicsICdvcGVuJyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYOKchSBCdWlsZCBwYW5lbCBvcGVuZWQgZm9yICR7YXJncy5wbGF0Zm9ybX0uIFBsZWFzZSBjb25maWd1cmUgYW5kIHN0YXJ0IGJ1aWxkIG1hbnVhbGx5LmAsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBwbGF0Zm9ybTogYXJncy5wbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICAgICAgZGVidWc6IGFyZ3MuZGVidWcsXG4gICAgICAgICAgICAgICAgICAgIGluc3RydWN0aW9uOiBcIlVzZSB0aGUgYnVpbGQgcGFuZWwgdG8gY29uZmlndXJlIGFuZCBzdGFydCB0aGUgYnVpbGQgcHJvY2Vzc1wiLFxuICAgICAgICAgICAgICAgICAgICBidWlsZE9wdGlvbnNcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcm9qZWN0SW5mbygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBpbmZvOiBQcm9qZWN0SW5mbyA9IHtcbiAgICAgICAgICAgIG5hbWU6IEVkaXRvci5Qcm9qZWN0Lm5hbWUsXG4gICAgICAgICAgICBwYXRoOiBFZGl0b3IuUHJvamVjdC5wYXRoLFxuICAgICAgICAgICAgdXVpZDogRWRpdG9yLlByb2plY3QudXVpZCxcbiAgICAgICAgICAgIHZlcnNpb246IChFZGl0b3IuUHJvamVjdCBhcyBhbnkpLnZlcnNpb24gfHwgJzEuMC4wJyxcbiAgICAgICAgICAgIGNvY29zVmVyc2lvbjogKEVkaXRvciBhcyBhbnkpLnZlcnNpb25zPy5jb2NvcyB8fCAnVW5rbm93bidcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBOb3RlOiAncXVlcnktaW5mbycgQVBJIGRvZXNuJ3QgZXhpc3QsIHVzaW5nICdxdWVyeS1jb25maWcnIGluc3RlYWRcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGFkZGl0aW9uYWxJbmZvOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcm9qZWN0JywgJ3F1ZXJ5LWNvbmZpZycsICdwcm9qZWN0Jyk7XG4gICAgICAgICAgICBpZiAoYWRkaXRpb25hbEluZm8pIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGluZm8sIHsgY29uZmlnOiBhZGRpdGlvbmFsSW5mbyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBg4pyFIFByb2plY3QgaW5mbyByZXRyaWV2ZWQ6ICR7aW5mby5uYW1lfWAsXG4gICAgICAgICAgICAgICAgZGF0YTogaW5mb1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyBSZXR1cm4gYmFzaWMgaW5mbyBldmVuIGlmIGRldGFpbGVkIHF1ZXJ5IGZhaWxzXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYOKchSBCYXNpYyBwcm9qZWN0IGluZm8gcmV0cmlldmVkOiAke2luZm8ubmFtZX1gLFxuICAgICAgICAgICAgICAgIGRhdGE6IGluZm9cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldFByb2plY3RTZXR0aW5ncyhjYXRlZ29yeTogc3RyaW5nID0gJ2dlbmVyYWwnKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgY29uc3QgY29uZmlnTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICAgICAgZ2VuZXJhbDogJ3Byb2plY3QnLFxuICAgICAgICAgICAgcGh5c2ljczogJ3BoeXNpY3MnLFxuICAgICAgICAgICAgcmVuZGVyOiAncmVuZGVyJyxcbiAgICAgICAgICAgIGFzc2V0czogJ2Fzc2V0LWRiJ1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGNvbmZpZ05hbWUgPSBjb25maWdNYXBbY2F0ZWdvcnldIHx8ICdwcm9qZWN0JztcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgc2V0dGluZ3M6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3Byb2plY3QnLCAncXVlcnktY29uZmlnJywgY29uZmlnTmFtZSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYOKchSAke2NhdGVnb3J5fSBzZXR0aW5ncyByZXRyaWV2ZWQgc3VjY2Vzc2Z1bGx5YCxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiBjYXRlZ29yeSxcbiAgICAgICAgICAgICAgICAgICAgY29uZmlnOiBzZXR0aW5nc1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldEJ1aWxkU2V0dGluZ3MoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlYWR5OiBib29sZWFuID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYnVpbGRlcicsICdxdWVyeS13b3JrZXItcmVhZHknKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBg4pyFIEJ1aWxkIHNldHRpbmdzIHN0YXR1cyByZXRyaWV2ZWRgLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgYnVpbGRlclJlYWR5OiByZWFkeSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0J1aWxkIHNldHRpbmdzIGFyZSBsaW1pdGVkIGluIE1DUCBwbHVnaW4gZW52aXJvbm1lbnQnLFxuICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVBY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICAnT3BlbiBidWlsZCBwYW5lbCB3aXRoIHByb2plY3RfYnVpbGRfc3lzdGVtIGFjdGlvbiBcIm9wZW5fYnVpbGRfcGFuZWxcIicsXG4gICAgICAgICAgICAgICAgICAgICAgICAnQ2hlY2sgYnVpbGRlciBzdGF0dXMgd2l0aCBwcm9qZWN0X2J1aWxkX3N5c3RlbSBhY3Rpb24gXCJjaGVja19idWlsZGVyX3N0YXR1c1wiJ1xuICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICBsaW1pdGF0aW9uOiAnRnVsbCBidWlsZCBjb25maWd1cmF0aW9uIHJlcXVpcmVzIGRpcmVjdCBFZGl0b3IgVUkgYWNjZXNzJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIG9wZW5CdWlsZFBhbmVsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdidWlsZGVyJywgJ29wZW4nKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAn4pyFIEJ1aWxkIHBhbmVsIG9wZW5lZCBzdWNjZXNzZnVsbHknXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjaGVja0J1aWxkZXJTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlYWR5OiBib29sZWFuID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYnVpbGRlcicsICdxdWVyeS13b3JrZXItcmVhZHknKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAn4pyFIEJ1aWxkZXIgc3RhdHVzIGNoZWNrZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlYWR5OiByZWFkeSxcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzOiByZWFkeSA/ICdCdWlsZGVyIHdvcmtlciBpcyByZWFkeScgOiAnQnVpbGRlciB3b3JrZXIgaXMgbm90IHJlYWR5J1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9XG5cbn1cbiJdfQ==