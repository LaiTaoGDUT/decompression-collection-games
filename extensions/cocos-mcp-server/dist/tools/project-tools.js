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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvamVjdC10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9wcm9qZWN0LXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUVBLE1BQWEsWUFBWTtJQUNyQixRQUFRO1FBQ0osT0FBTztZQUNIO2dCQUNJLElBQUksRUFBRSxnQkFBZ0I7Z0JBQ3RCLFdBQVcsRUFBRSx1V0FBdVc7Z0JBQ3BYLFdBQVcsRUFBRTtvQkFDVCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1IsTUFBTSxFQUFFOzRCQUNKLElBQUksRUFBRSxRQUFROzRCQUNkLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxjQUFjLENBQUM7NEJBQzVELFdBQVcsRUFBRSwyVUFBMlU7eUJBQzNWO3dCQUNELHlCQUF5Qjt3QkFDekIsUUFBUSxFQUFFOzRCQUNOLElBQUksRUFBRSxRQUFROzRCQUNkLElBQUksRUFBRSxDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsU0FBUyxDQUFDOzRCQUN6QyxXQUFXLEVBQUUsNFBBQTRQOzRCQUN6USxPQUFPLEVBQUUsU0FBUzt5QkFDckI7d0JBQ0QsbUJBQW1CO3dCQUNuQixhQUFhLEVBQUU7NEJBQ1gsSUFBSSxFQUFFLFFBQVE7NEJBQ2QsSUFBSSxFQUFFLENBQUMsWUFBWSxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUM7NEJBQ3ZFLFdBQVcsRUFBRSx1TkFBdU47eUJBQ3ZPO3dCQUNELEtBQUssRUFBRTs0QkFDSCxJQUFJLEVBQUUsU0FBUzs0QkFDZixXQUFXLEVBQUUsbU9BQW1POzRCQUNoUCxPQUFPLEVBQUUsSUFBSTt5QkFDaEI7d0JBQ0QsMEJBQTBCO3dCQUMxQixRQUFRLEVBQUU7NEJBQ04sSUFBSSxFQUFFLFFBQVE7NEJBQ2QsSUFBSSxFQUFFLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDOzRCQUNoRCxXQUFXLEVBQUUsbU5BQW1OOzRCQUNoTyxPQUFPLEVBQUUsU0FBUzt5QkFDckI7cUJBQ0o7b0JBQ0QsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDO2lCQUN2QjthQUNKO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLHNCQUFzQjtnQkFDNUIsV0FBVyxFQUFFLG9KQUFvSjtnQkFDakssV0FBVyxFQUFFO29CQUNULElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRTt3QkFDUixNQUFNLEVBQUU7NEJBQ0osSUFBSSxFQUFFLFFBQVE7NEJBQ2QsSUFBSSxFQUFFLENBQUMsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsc0JBQXNCLENBQUM7NEJBQ3hFLFdBQVcsRUFBRSxnQ0FBZ0M7eUJBQ2hEO3FCQUNKO29CQUNELFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQztpQkFDdkI7YUFDSjtTQUNKLENBQUM7SUFDTixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFnQixFQUFFLElBQVM7UUFDckMsUUFBUSxRQUFRLEVBQUUsQ0FBQztZQUNmLEtBQUssZ0JBQWdCO2dCQUNqQixPQUFPLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hELEtBQUssc0JBQXNCO2dCQUN2QixPQUFPLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzlDO2dCQUNJLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDckQsQ0FBQztJQUNMLENBQUM7SUFFRCw0QkFBNEI7SUFDcEIsS0FBSyxDQUFDLG1CQUFtQixDQUFDLElBQVM7UUFDdkMsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQztRQUV4QixRQUFRLE1BQU0sRUFBRSxDQUFDO1lBQ2IsS0FBSyxLQUFLO2dCQUNOLE9BQU8sTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNoRCxLQUFLLFFBQVE7Z0JBQ1QsT0FBTyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ25ELEtBQUssT0FBTztnQkFDUixPQUFPLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUN4RixLQUFLLFVBQVU7Z0JBQ1gsT0FBTyxNQUFNLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN2QyxLQUFLLGNBQWM7Z0JBQ2YsT0FBTyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDeEQ7Z0JBQ0ksT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGtDQUFrQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1FBQ3JGLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQVM7UUFDckMsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQztRQUV4QixRQUFRLE1BQU0sRUFBRSxDQUFDO1lBQ2IsS0FBSyxvQkFBb0I7Z0JBQ3JCLE9BQU8sTUFBTSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN6QyxLQUFLLGtCQUFrQjtnQkFDbkIsT0FBTyxNQUFNLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN2QyxLQUFLLHNCQUFzQjtnQkFDdkIsT0FBTyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzNDO2dCQUNJLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxnQ0FBZ0MsTUFBTSxFQUFFLEVBQUUsQ0FBQztRQUNuRixDQUFDO0lBQ0wsQ0FBQztJQUVELGtDQUFrQztJQUMxQixLQUFLLENBQUMsVUFBVSxDQUFDLFdBQW1CLFNBQVM7UUFDakQsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFL0QsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3pDLE9BQU87Z0JBQ0gsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLGlDQUFpQyxRQUFRLDBCQUEwQixrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7YUFDNUcsQ0FBQztRQUNOLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDRCxJQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDekIsTUFBTSxTQUFTLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3pGLE9BQU87b0JBQ0gsT0FBTyxFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUM7b0JBQzNCLE9BQU8sRUFBRSxTQUFTO3dCQUNkLENBQUMsQ0FBQywwQ0FBMEM7d0JBQzVDLENBQUMsQ0FBQyxpREFBaUQ7b0JBQ3ZELElBQUksRUFBRTt3QkFDRixRQUFRO3dCQUNSLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDO3FCQUNoQztpQkFDSixDQUFDO1lBQ04sQ0FBQztZQUVELHFFQUFxRTtZQUNyRSxtRUFBbUU7WUFDbkUsZ0VBQWdFO1lBQ2hFLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLDBCQUEwQixFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN6RixNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFNUQsb0VBQW9FO1lBQ3BFLG9FQUFvRTtZQUNwRSxxRUFBcUU7WUFDckUsNkRBQTZEO1lBQzdELElBQUksVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzlDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNuQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ1YsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUNwRSxVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDOUMsQ0FBQztZQUVELE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsT0FBTyxFQUFFLFFBQVEsS0FBSyxTQUFTO29CQUMzQixDQUFDLENBQUMsTUFBTTt3QkFDSixDQUFDLENBQUMscUVBQXFFO3dCQUN2RSxDQUFDLENBQUMsNEVBQTRFO29CQUNsRixDQUFDLENBQUMsTUFBTTt3QkFDSixDQUFDLENBQUMsbURBQW1EO3dCQUNyRCxDQUFDLENBQUMsbUNBQW1DO2dCQUM3QyxJQUFJLGtCQUNBLFFBQVE7b0JBQ1IsTUFBTSxJQUNILENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FDeEM7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVPLEtBQUssQ0FBQyxlQUFlO1FBQ3pCLElBQUksQ0FBQztZQUNELE1BQU0sVUFBVSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLG1CQUFtQixDQUFDLENBQUM7WUFDaEYsT0FBTyxPQUFPLFVBQVUsS0FBSyxRQUFRLElBQUksVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDO2dCQUNqRSxDQUFDLENBQUMsVUFBVTtnQkFDWixDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ3BCLENBQUM7UUFBQyxXQUFNLENBQUM7WUFDTCxpRUFBaUU7WUFDakUsc0RBQXNEO1lBQ3RELE9BQU8sU0FBUyxDQUFDO1FBQ3JCLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLGFBQWEsQ0FBQyxXQUFtQixTQUFTO1FBQ3BELE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFcEQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3pDLE9BQU87Z0JBQ0gsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLHlFQUF5RSxRQUFRLEVBQUU7YUFDN0YsQ0FBQztRQUNOLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDRCxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNoRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2QsT0FBTztvQkFDSCxPQUFPLEVBQUUsS0FBSztvQkFDZCxLQUFLLEVBQUUseUZBQXlGO2lCQUNuRyxDQUFDO1lBQ04sQ0FBQztZQUVELGdFQUFnRTtZQUNoRSw4QkFBOEI7WUFDOUIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFFbEQsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixPQUFPLEVBQUUsUUFBUSxLQUFLLFNBQVM7b0JBQzNCLENBQUMsQ0FBQyxxRUFBcUU7b0JBQ3ZFLENBQUMsQ0FBQyw2Q0FBNkM7Z0JBQ25ELElBQUksRUFBRTtvQkFDRixRQUFRO29CQUNSLFVBQVU7b0JBQ1YsTUFBTSxFQUFFLElBQUk7aUJBQ2Y7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVPLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBUztRQUNoQyxNQUFNLFlBQVksR0FBRztZQUNqQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEtBQUssS0FBSztZQUMzQixVQUFVLEVBQUUsSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLO1lBQ2hDLFNBQVMsRUFBRSxTQUFTLElBQUksQ0FBQyxRQUFRLEVBQUU7U0FDdEMsQ0FBQztRQUVGLHFFQUFxRTtRQUNyRSwrREFBK0Q7UUFDL0QsSUFBSSxDQUFDO1lBQ0QsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDaEQsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixPQUFPLEVBQUUsNEJBQTRCLElBQUksQ0FBQyxRQUFRLDhDQUE4QztnQkFDaEcsSUFBSSxFQUFFO29CQUNGLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtvQkFDdkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO29CQUNqQixXQUFXLEVBQUUsOERBQThEO29CQUMzRSxZQUFZO2lCQUNmO2FBQ0osQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbEQsQ0FBQztJQUNMLENBQUM7SUFFTyxLQUFLLENBQUMsY0FBYzs7UUFDeEIsTUFBTSxJQUFJLEdBQWdCO1lBQ3RCLElBQUksRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUk7WUFDekIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSTtZQUN6QixJQUFJLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJO1lBQ3pCLE9BQU8sRUFBRyxNQUFNLENBQUMsT0FBZSxDQUFDLE9BQU8sSUFBSSxPQUFPO1lBQ25ELFlBQVksRUFBRSxDQUFBLE1BQUMsTUFBYyxDQUFDLFFBQVEsMENBQUUsS0FBSyxLQUFJLFNBQVM7U0FDN0QsQ0FBQztRQUVGLHFFQUFxRTtRQUNyRSxJQUFJLENBQUM7WUFDRCxNQUFNLGNBQWMsR0FBUSxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxjQUFjLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDL0YsSUFBSSxjQUFjLEVBQUUsQ0FBQztnQkFDakIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztZQUNwRCxDQUFDO1lBQ0QsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixPQUFPLEVBQUUsNkJBQTZCLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ2pELElBQUksRUFBRSxJQUFJO2FBQ2IsQ0FBQztRQUNOLENBQUM7UUFBQyxXQUFNLENBQUM7WUFDTCxpREFBaUQ7WUFDakQsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixPQUFPLEVBQUUsbUNBQW1DLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ3ZELElBQUksRUFBRSxJQUFJO2FBQ2IsQ0FBQztRQUNOLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLGtCQUFrQixDQUFDLFdBQW1CLFNBQVM7UUFDekQsTUFBTSxTQUFTLEdBQTJCO1lBQ3RDLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE1BQU0sRUFBRSxRQUFRO1lBQ2hCLE1BQU0sRUFBRSxVQUFVO1NBQ3JCLENBQUM7UUFFRixNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksU0FBUyxDQUFDO1FBRXBELElBQUksQ0FBQztZQUNELE1BQU0sUUFBUSxHQUFRLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGNBQWMsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUMxRixPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLE9BQU8sRUFBRSxLQUFLLFFBQVEsa0NBQWtDO2dCQUN4RCxJQUFJLEVBQUU7b0JBQ0YsUUFBUSxFQUFFLFFBQVE7b0JBQ2xCLE1BQU0sRUFBRSxRQUFRO2lCQUNuQjthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLGdCQUFnQjtRQUMxQixJQUFJLENBQUM7WUFDRCxNQUFNLEtBQUssR0FBWSxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1lBQ3JGLE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsT0FBTyxFQUFFLG1DQUFtQztnQkFDNUMsSUFBSSxFQUFFO29CQUNGLFlBQVksRUFBRSxLQUFLO29CQUNuQixPQUFPLEVBQUUsc0RBQXNEO29CQUMvRCxnQkFBZ0IsRUFBRTt3QkFDZCxzRUFBc0U7d0JBQ3RFLDhFQUE4RTtxQkFDakY7b0JBQ0QsVUFBVSxFQUFFLDJEQUEyRDtpQkFDMUU7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVPLEtBQUssQ0FBQyxjQUFjO1FBQ3hCLElBQUksQ0FBQztZQUNELE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ2hELE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsT0FBTyxFQUFFLG1DQUFtQzthQUMvQyxDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBUSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVPLEtBQUssQ0FBQyxrQkFBa0I7UUFDNUIsSUFBSSxDQUFDO1lBQ0QsTUFBTSxLQUFLLEdBQVksTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUNyRixPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLE9BQU8sRUFBRSx1Q0FBdUM7Z0JBQ2hELElBQUksRUFBRTtvQkFDRixLQUFLLEVBQUUsS0FBSztvQkFDWixNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsNkJBQTZCO2lCQUM1RTthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxHQUFRLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0NBRUo7QUFqV0Qsb0NBaVdDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBQcm9qZWN0SW5mbyB9IGZyb20gJy4uL3R5cGVzJztcclxuXHJcbmV4cG9ydCBjbGFzcyBQcm9qZWN0VG9vbHMgaW1wbGVtZW50cyBUb29sRXhlY3V0b3Ige1xyXG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XHJcbiAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbmFtZTogJ3Byb2plY3RfbWFuYWdlJyxcclxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUFJPSkVDVCBNQU5BR0VNRU5UOiBDb3JlIHByb2plY3Qgb3BlcmF0aW9ucyBhbmQgY29uZmlndXJhdGlvbi4gQ09NTU9OIFdPUktGTE9XUzogZ2V0X2luZm8gZm9yIHByb2plY3QgZGV0YWlscywgcnVuIGZvciBwcmV2aWV3IHRlc3RpbmcsIGJ1aWxkIGZvciBkZXBsb3ltZW50IHByZXBhcmF0aW9uLCBnZXRfc2V0dGluZ3MgZm9yIGNvbmZpZ3VyYXRpb24gaW5zcGVjdGlvbi4gQnJvd3NlciBhbmQgc2ltdWxhdG9yIHByZXZpZXcgdXNlIHRoZSBlZGl0b3IgcHJldmlldyBydW50aW1lIGRpcmVjdGx5OyBidWlsZCBvcGVyYXRpb25zIHN0aWxsIHJlcXVpcmUgbWFudWFsIGludGVyYWN0aW9uIGR1ZSB0byBBUEkgbGltaXRhdGlvbnMuJyxcclxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb246IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW51bTogWydydW4nLCAncmVsb2FkJywgJ2J1aWxkJywgJ2dldF9pbmZvJywgJ2dldF9zZXR0aW5ncyddLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdQcm9qZWN0IG9wZXJhdGlvbjogXCJydW5cIiA9IHN0YXJ0IG9yIHJldXNlIHByZXZpZXcvdGVzdGluZyAocmVxdWlyZXMgcGxhdGZvcm0pIHwgXCJyZWxvYWRcIiA9IHJlZnJlc2ggYW4gZXhpc3RpbmcgYnJvd3Nlci9zaW11bGF0b3IgcHJldmlldyB3aXRob3V0IG9wZW5pbmcgYSBuZXcgdGFiIHwgXCJidWlsZFwiID0gcHJlcGFyZSBmb3IgZGVwbG95bWVudCAocmVxdWlyZXMgYnVpbGRQbGF0Zm9ybSkgfCBcImdldF9pbmZvXCIgPSBwcm9qZWN0IG1ldGFkYXRhIGFuZCBwYXRocyB8IFwiZ2V0X3NldHRpbmdzXCIgPSBjb25maWd1cmF0aW9uIGJ5IGNhdGVnb3J5IChyZXF1aXJlcyBjYXRlZ29yeSknXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBydW4vcmVsb2FkIGFjdGlvbnNcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGxhdGZvcm06IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW51bTogWydicm93c2VyJywgJ3NpbXVsYXRvcicsICdwcmV2aWV3J10sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1ByZXZpZXcgcGxhdGZvcm0gKHJ1bi9yZWxvYWQgYWN0aW9uKS4gXCJicm93c2VyXCIgPSBzdGFydCBvciByZXVzZSBDb2NvcyBicm93c2VyIHByZXZpZXcsIFwic2ltdWxhdG9yXCIgPSBkZXZpY2Ugc2ltdWxhdGlvbiwgXCJwcmV2aWV3XCIgPSBlZGl0b3IgR2FtZSBWaWV3IHByZXZpZXcuIEJyb3dzZXIgcHJldmlldyBpcyBlcXVpdmFsZW50IHRvIGNsaWNraW5nIHRoZSB0b3AgdG9vbGJhciBSdW4gYnV0dG9uIHdpdGggQnJvd3NlciBzZWxlY3RlZC4nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDogJ2Jyb3dzZXInXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBidWlsZCBhY3Rpb25cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnVpbGRQbGF0Zm9ybToge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnVtOiBbJ3dlYi1tb2JpbGUnLCAnd2ViLWRlc2t0b3AnLCAnaW9zJywgJ2FuZHJvaWQnLCAnd2luZG93cycsICdtYWMnXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGFyZ2V0IGRlcGxveW1lbnQgcGxhdGZvcm0gKFJFUVVJUkVEIGZvciBidWlsZCBhY3Rpb24pLiBcIndlYi1tb2JpbGVcIiA9IG1vYmlsZSB3ZWIsIFwid2ViLWRlc2t0b3BcIiA9IGRlc2t0b3Agd2ViLCBcImlvc1wiID0gaVBob25lL2lQYWQsIFwiYW5kcm9pZFwiID0gQW5kcm9pZCBkZXZpY2VzLCBcIndpbmRvd3NcIiA9IFdpbmRvd3MgZGVza3RvcCwgXCJtYWNcIiA9IG1hY09TIGRlc2t0b3AuJ1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Zzoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdCdWlsZCBjb25maWd1cmF0aW9uIChidWlsZCBhY3Rpb24pLiB0cnVlID0gZGV2ZWxvcG1lbnQgYnVpbGQgd2l0aCBkZWJ1ZyBpbmZvIGFuZCBzb3VyY2UgbWFwcyAobGFyZ2VyIHNpemUsIGVhc2llciBkZWJ1Z2dpbmcpLCBmYWxzZSA9IG9wdGltaXplZCBwcm9kdWN0aW9uIGJ1aWxkIChzbWFsbGVyIHNpemUsIGhhcmRlciBkZWJ1Z2dpbmcpLiBSZWNvbW1lbmRlZDogdHJ1ZSBmb3IgdGVzdGluZy4nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3IgZ2V0X3NldHRpbmdzIGFjdGlvblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeToge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnVtOiBbJ2dlbmVyYWwnLCAncGh5c2ljcycsICdyZW5kZXInLCAnYXNzZXRzJ10sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NvbmZpZ3VyYXRpb24gY2F0ZWdvcnkgKGdldF9zZXR0aW5ncyBhY3Rpb24pLiBcImdlbmVyYWxcIiA9IGJhc2ljIHByb2plY3Qgc2V0dGluZ3MsIFwicGh5c2ljc1wiID0gcGh5c2ljcyBlbmdpbmUgY29uZmlnLCBcInJlbmRlclwiID0gcmVuZGVyaW5nIHNldHRpbmdzLCBcImFzc2V0c1wiID0gYXNzZXQgcHJvY2Vzc2luZy4gRGVmYXVsdDogZ2VuZXJhbCBmb3IgYmFzaWMgaW5mby4nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDogJ2dlbmVyYWwnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVkOiBbJ2FjdGlvbiddXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5hbWU6ICdwcm9qZWN0X2J1aWxkX3N5c3RlbScsXHJcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0JVSUxEIFNZU1RFTTogQ29udHJvbCBidWlsZCBwYW5lbCwgY2hlY2sgYnVpbGRlciBzdGF0dXMsIGFuZCBtYW5hZ2UgcHJldmlldyBzZXJ2ZXJzLiBVc2UgdGhpcyBmb3IgYnVpbGQtcmVsYXRlZCBvcGVyYXRpb25zIGFuZCBwcmV2aWV3IG1hbmFnZW1lbnQuJyxcclxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb246IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW51bTogWydnZXRfYnVpbGRfc2V0dGluZ3MnLCAnb3Blbl9idWlsZF9wYW5lbCcsICdjaGVja19idWlsZGVyX3N0YXR1cyddLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdCdWlsZCBzeXN0ZW0gYWN0aW9uIHRvIHBlcmZvcm0nXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVkOiBbJ2FjdGlvbiddXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcclxuICAgICAgICBzd2l0Y2ggKHRvb2xOYW1lKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ3Byb2plY3RfbWFuYWdlJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmhhbmRsZVByb2plY3RNYW5hZ2UoYXJncyk7XHJcbiAgICAgICAgICAgIGNhc2UgJ3Byb2plY3RfYnVpbGRfc3lzdGVtJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmhhbmRsZUJ1aWxkU3lzdGVtKGFyZ3MpO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvb2w6ICR7dG9vbE5hbWV9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIE5ldyBjb25zb2xpZGF0ZWQgaGFuZGxlcnNcclxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlUHJvamVjdE1hbmFnZShhcmdzOiBhbnkpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xyXG4gICAgICAgIGNvbnN0IHsgYWN0aW9uIH0gPSBhcmdzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAoYWN0aW9uKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ3J1bic6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5ydW5Qcm9qZWN0KGFyZ3MucGxhdGZvcm0pO1xyXG4gICAgICAgICAgICBjYXNlICdyZWxvYWQnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucmVsb2FkUHJldmlldyhhcmdzLnBsYXRmb3JtKTtcclxuICAgICAgICAgICAgY2FzZSAnYnVpbGQnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuYnVpbGRQcm9qZWN0KHsgcGxhdGZvcm06IGFyZ3MuYnVpbGRQbGF0Zm9ybSwgZGVidWc6IGFyZ3MuZGVidWcgfSk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2dldF9pbmZvJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFByb2plY3RJbmZvKCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2dldF9zZXR0aW5ncyc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRQcm9qZWN0U2V0dGluZ3MoYXJncy5jYXRlZ29yeSk7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBVbmtub3duIHByb2plY3QgbWFuYWdlIGFjdGlvbjogJHthY3Rpb259YCB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGhhbmRsZUJ1aWxkU3lzdGVtKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgY29uc3QgeyBhY3Rpb24gfSA9IGFyZ3M7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChhY3Rpb24pIHtcclxuICAgICAgICAgICAgY2FzZSAnZ2V0X2J1aWxkX3NldHRpbmdzJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldEJ1aWxkU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgY2FzZSAnb3Blbl9idWlsZF9wYW5lbCc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5vcGVuQnVpbGRQYW5lbCgpO1xyXG4gICAgICAgICAgICBjYXNlICdjaGVja19idWlsZGVyX3N0YXR1cyc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jaGVja0J1aWxkZXJTdGF0dXMoKTtcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFVua25vd24gYnVpbGQgc3lzdGVtIGFjdGlvbjogJHthY3Rpb259YCB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBPcmlnaW5hbCBpbXBsZW1lbnRhdGlvbiBtZXRob2RzXHJcbiAgICBwcml2YXRlIGFzeW5jIHJ1blByb2plY3QocGxhdGZvcm06IHN0cmluZyA9ICdicm93c2VyJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgY29uc3Qgc3VwcG9ydGVkUGxhdGZvcm1zID0gWydicm93c2VyJywgJ3NpbXVsYXRvcicsICdwcmV2aWV3J107XHJcblxyXG4gICAgICAgIGlmICghc3VwcG9ydGVkUGxhdGZvcm1zLmluY2x1ZGVzKHBsYXRmb3JtKSkge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICBlcnJvcjogYFVuc3VwcG9ydGVkIHByZXZpZXcgcGxhdGZvcm06ICR7cGxhdGZvcm19LiBTdXBwb3J0ZWQgcGxhdGZvcm1zOiAke3N1cHBvcnRlZFBsYXRmb3Jtcy5qb2luKCcsICcpfWBcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmIChwbGF0Zm9ybSA9PT0gJ3ByZXZpZXcnKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpc1BsYXlpbmcgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdlZGl0b3ItcHJldmlldy1zZXQtcGxheScsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBCb29sZWFuKGlzUGxheWluZyksXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogaXNQbGF5aW5nXHJcbiAgICAgICAgICAgICAgICAgICAgICAgID8gJ+KchSBDb2NvcyBlZGl0b3IgR2FtZSBWaWV3IHByZXZpZXcgc3RhcnRlZCdcclxuICAgICAgICAgICAgICAgICAgICAgICAgOiAn4pqg77iPIENvY29zIGVkaXRvciBHYW1lIFZpZXcgcHJldmlldyBkaWQgbm90IHN0YXJ0JyxcclxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBsYXRmb3JtLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1BsYXlpbmc6IEJvb2xlYW4oaXNQbGF5aW5nKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFRoaXMgbWlycm9ycyB0aGUgUHJldmlldyB0b29sYmFyJ3MgcGxhdGZvcm0gc3dpdGNoIGJlZm9yZSBpdCBjYWxsc1xyXG4gICAgICAgICAgICAvLyBwcmV2aWV3Lm9wZW4tdGVybWluYWwuIFVubGlrZSBidWlsZGVyLm9wZW4sIG9wZW4tdGVybWluYWwgc3RhcnRzXHJcbiAgICAgICAgICAgIC8vIHRoZSBhY3R1YWwgQ29jb3MgcHJldmlldyBzZXJ2ZXIgYW5kIG9wZW5zL3JldXNlcyB0aGUgYnJvd3Nlci5cclxuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLlByb2ZpbGUuc2V0Q29uZmlnKCdwcmV2aWV3JywgJ3ByZXZpZXcuY3VycmVudC5wbGF0Zm9ybScsIHBsYXRmb3JtLCAnbG9jYWwnKTtcclxuICAgICAgICAgICAgRWRpdG9yLk1lc3NhZ2Uuc2VuZCgncHJldmlldycsICdjaGFuZ2UtcGxhdGZvcm0nLCBwbGF0Zm9ybSk7XHJcblxyXG4gICAgICAgICAgICAvLyBxdWVyeS1wcmV2aWV3LXVybCBpcyB0aGUgbGVhc3QgaW52YXNpdmUgd2F5IHRvIGRldGVjdCB3aGV0aGVyIHRoZVxyXG4gICAgICAgICAgICAvLyBwcmV2aWV3IHNlcnZpY2UgaXMgYWxyZWFkeSBhdmFpbGFibGUuIENhbGxpbmcgb3Blbi10ZXJtaW5hbCBldmVyeVxyXG4gICAgICAgICAgICAvLyB0aW1lIHN0YXJ0cy9yZXVzZXMgdGhlIHNlcnZpY2UgYnV0IGFsc28gYXNrcyBDcmVhdG9yIHRvIG9wZW4gYSBuZXdcclxuICAgICAgICAgICAgLy8gYnJvd3NlciB0YWIsIHNvIG9ubHkgY2FsbCBpdCB3aGVuIG5vIFVSTCBpcyBhdmFpbGFibGUgeWV0LlxyXG4gICAgICAgICAgICBsZXQgcHJldmlld1VybCA9IGF3YWl0IHRoaXMucXVlcnlQcmV2aWV3VXJsKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJldXNlZCA9IEJvb2xlYW4ocHJldmlld1VybCk7XHJcbiAgICAgICAgICAgIGlmICghcmV1c2VkKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdwcmV2aWV3JywgJ29wZW4tdGVybWluYWwnLCB1bmRlZmluZWQpO1xyXG4gICAgICAgICAgICAgICAgcHJldmlld1VybCA9IGF3YWl0IHRoaXMucXVlcnlQcmV2aWV3VXJsKCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogcGxhdGZvcm0gPT09ICdicm93c2VyJ1xyXG4gICAgICAgICAgICAgICAgICAgID8gcmV1c2VkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgID8gJ+KchSBFeGlzdGluZyBDb2NvcyBicm93c2VyIHByZXZpZXcgc2VydmljZSByZXVzZWQgKG5vIG5ldyB0YWIgb3BlbmVkKSdcclxuICAgICAgICAgICAgICAgICAgICAgICAgOiAn4pyFIENvY29zIGJyb3dzZXIgcHJldmlldyBzdGFydGVkIChlcXVpdmFsZW50IHRvIHRoZSB0b3AgdG9vbGJhciBSdW4gYnV0dG9uKSdcclxuICAgICAgICAgICAgICAgICAgICA6IHJldXNlZFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA/ICfinIUgRXhpc3RpbmcgQ29jb3Mgc2ltdWxhdG9yIHByZXZpZXcgc2VydmljZSByZXVzZWQnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDogJ+KchSBDb2NvcyBzaW11bGF0b3IgcHJldmlldyBzdGFydGVkJyxcclxuICAgICAgICAgICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgICAgICAgICAgICBwbGF0Zm9ybSxcclxuICAgICAgICAgICAgICAgICAgICByZXVzZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgLi4uKHByZXZpZXdVcmwgPyB7IHByZXZpZXdVcmwgfSA6IHt9KVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBxdWVyeVByZXZpZXdVcmwoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBwcmV2aWV3VXJsID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJldmlldycsICdxdWVyeS1wcmV2aWV3LXVybCcpO1xyXG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHByZXZpZXdVcmwgPT09ICdzdHJpbmcnICYmIHByZXZpZXdVcmwudHJpbSgpLmxlbmd0aCA+IDBcclxuICAgICAgICAgICAgICAgID8gcHJldmlld1VybFxyXG4gICAgICAgICAgICAgICAgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgIC8vIE9sZGVyIENyZWF0b3IgdmVyc2lvbnMgbWF5IG5vdCBleHBvc2UgcXVlcnktcHJldmlldy11cmwgb3IgbWF5XHJcbiAgICAgICAgICAgIC8vIHJlamVjdCBpdCB3aGlsZSB0aGUgcHJldmlldyBzZXJ2aWNlIGlzIG5vdCBydW5uaW5nLlxyXG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHJlbG9hZFByZXZpZXcocGxhdGZvcm06IHN0cmluZyA9ICdicm93c2VyJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgY29uc3Qgc3VwcG9ydGVkUGxhdGZvcm1zID0gWydicm93c2VyJywgJ3NpbXVsYXRvciddO1xyXG5cclxuICAgICAgICBpZiAoIXN1cHBvcnRlZFBsYXRmb3Jtcy5pbmNsdWRlcyhwbGF0Zm9ybSkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgZXJyb3I6IGBSZWxvYWQgaXMgb25seSBzdXBwb3J0ZWQgZm9yIGJyb3dzZXIgb3Igc2ltdWxhdG9yIHByZXZpZXdzLiBSZWNlaXZlZDogJHtwbGF0Zm9ybX1gXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBwcmV2aWV3VXJsID0gYXdhaXQgdGhpcy5xdWVyeVByZXZpZXdVcmwoKTtcclxuICAgICAgICAgICAgaWYgKCFwcmV2aWV3VXJsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAnTm8gYWN0aXZlIENvY29zIHByZXZpZXcgc2VydmljZSB3YXMgZm91bmQuIENhbGwgcHJvamVjdF9tYW5hZ2Ugd2l0aCBhY3Rpb24gXCJydW5cIiBmaXJzdC4nXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyByZWxvYWQtdGVybWluYWwgcmVmcmVzaGVzIGV4aXN0aW5nIHByZXZpZXcgcGFnZXMgYW5kIGRvZXMgbm90XHJcbiAgICAgICAgICAgIC8vIGxhdW5jaCBhbm90aGVyIGJyb3dzZXIgdGFiLlxyXG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdwcmV2aWV3JywgJ3JlbG9hZC10ZXJtaW5hbCcpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBwbGF0Zm9ybSA9PT0gJ2Jyb3dzZXInXHJcbiAgICAgICAgICAgICAgICAgICAgPyAn4pyFIEV4aXN0aW5nIENvY29zIGJyb3dzZXIgcHJldmlldyByZWxvYWRlZCB3aXRob3V0IG9wZW5pbmcgYSBuZXcgdGFiJ1xyXG4gICAgICAgICAgICAgICAgICAgIDogJ+KchSBFeGlzdGluZyBDb2NvcyBzaW11bGF0b3IgcHJldmlldyByZWxvYWRlZCcsXHJcbiAgICAgICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcGxhdGZvcm0sXHJcbiAgICAgICAgICAgICAgICAgICAgcHJldmlld1VybCxcclxuICAgICAgICAgICAgICAgICAgICByZXVzZWQ6IHRydWVcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgYnVpbGRQcm9qZWN0KGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgY29uc3QgYnVpbGRPcHRpb25zID0ge1xyXG4gICAgICAgICAgICBwbGF0Zm9ybTogYXJncy5wbGF0Zm9ybSxcclxuICAgICAgICAgICAgZGVidWc6IGFyZ3MuZGVidWcgIT09IGZhbHNlLFxyXG4gICAgICAgICAgICBzb3VyY2VNYXBzOiBhcmdzLmRlYnVnICE9PSBmYWxzZSxcclxuICAgICAgICAgICAgYnVpbGRQYXRoOiBgYnVpbGQvJHthcmdzLnBsYXRmb3JtfWBcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBOb3RlOiBCdWlsZGVyIG1vZHVsZSBvbmx5IHN1cHBvcnRzICdvcGVuJyBhbmQgJ3F1ZXJ5LXdvcmtlci1yZWFkeSdcclxuICAgICAgICAvLyBCdWlsZGluZyByZXF1aXJlcyBtYW51YWwgaW50ZXJhY3Rpb24gdGhyb3VnaCB0aGUgYnVpbGQgcGFuZWxcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdidWlsZGVyJywgJ29wZW4nKTtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBg4pyFIEJ1aWxkIHBhbmVsIG9wZW5lZCBmb3IgJHthcmdzLnBsYXRmb3JtfS4gUGxlYXNlIGNvbmZpZ3VyZSBhbmQgc3RhcnQgYnVpbGQgbWFudWFsbHkuYCxcclxuICAgICAgICAgICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgICAgICAgICAgICBwbGF0Zm9ybTogYXJncy5wbGF0Zm9ybSxcclxuICAgICAgICAgICAgICAgICAgICBkZWJ1ZzogYXJncy5kZWJ1ZyxcclxuICAgICAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbjogXCJVc2UgdGhlIGJ1aWxkIHBhbmVsIHRvIGNvbmZpZ3VyZSBhbmQgc3RhcnQgdGhlIGJ1aWxkIHByb2Nlc3NcIixcclxuICAgICAgICAgICAgICAgICAgICBidWlsZE9wdGlvbnNcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJvamVjdEluZm8oKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcclxuICAgICAgICBjb25zdCBpbmZvOiBQcm9qZWN0SW5mbyA9IHtcclxuICAgICAgICAgICAgbmFtZTogRWRpdG9yLlByb2plY3QubmFtZSxcclxuICAgICAgICAgICAgcGF0aDogRWRpdG9yLlByb2plY3QucGF0aCxcclxuICAgICAgICAgICAgdXVpZDogRWRpdG9yLlByb2plY3QudXVpZCxcclxuICAgICAgICAgICAgdmVyc2lvbjogKEVkaXRvci5Qcm9qZWN0IGFzIGFueSkudmVyc2lvbiB8fCAnMS4wLjAnLFxyXG4gICAgICAgICAgICBjb2Nvc1ZlcnNpb246IChFZGl0b3IgYXMgYW55KS52ZXJzaW9ucz8uY29jb3MgfHwgJ1Vua25vd24nXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gTm90ZTogJ3F1ZXJ5LWluZm8nIEFQSSBkb2Vzbid0IGV4aXN0LCB1c2luZyAncXVlcnktY29uZmlnJyBpbnN0ZWFkXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgYWRkaXRpb25hbEluZm86IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3Byb2plY3QnLCAncXVlcnktY29uZmlnJywgJ3Byb2plY3QnKTtcclxuICAgICAgICAgICAgaWYgKGFkZGl0aW9uYWxJbmZvKSB7XHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGluZm8sIHsgY29uZmlnOiBhZGRpdGlvbmFsSW5mbyB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGDinIUgUHJvamVjdCBpbmZvIHJldHJpZXZlZDogJHtpbmZvLm5hbWV9YCxcclxuICAgICAgICAgICAgICAgIGRhdGE6IGluZm9cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgLy8gUmV0dXJuIGJhc2ljIGluZm8gZXZlbiBpZiBkZXRhaWxlZCBxdWVyeSBmYWlsc1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGDinIUgQmFzaWMgcHJvamVjdCBpbmZvIHJldHJpZXZlZDogJHtpbmZvLm5hbWV9YCxcclxuICAgICAgICAgICAgICAgIGRhdGE6IGluZm9cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcm9qZWN0U2V0dGluZ3MoY2F0ZWdvcnk6IHN0cmluZyA9ICdnZW5lcmFsJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgY29uc3QgY29uZmlnTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gICAgICAgICAgICBnZW5lcmFsOiAncHJvamVjdCcsXHJcbiAgICAgICAgICAgIHBoeXNpY3M6ICdwaHlzaWNzJyxcclxuICAgICAgICAgICAgcmVuZGVyOiAncmVuZGVyJyxcclxuICAgICAgICAgICAgYXNzZXRzOiAnYXNzZXQtZGInXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgY29uZmlnTmFtZSA9IGNvbmZpZ01hcFtjYXRlZ29yeV0gfHwgJ3Byb2plY3QnO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBzZXR0aW5nczogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgncHJvamVjdCcsICdxdWVyeS1jb25maWcnLCBjb25maWdOYW1lKTtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBg4pyFICR7Y2F0ZWdvcnl9IHNldHRpbmdzIHJldHJpZXZlZCBzdWNjZXNzZnVsbHlgLFxyXG4gICAgICAgICAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhdGVnb3J5OiBjYXRlZ29yeSxcclxuICAgICAgICAgICAgICAgICAgICBjb25maWc6IHNldHRpbmdzXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGdldEJ1aWxkU2V0dGluZ3MoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZWFkeTogYm9vbGVhbiA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2J1aWxkZXInLCAncXVlcnktd29ya2VyLXJlYWR5Jyk7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYOKchSBCdWlsZCBzZXR0aW5ncyBzdGF0dXMgcmV0cmlldmVkYCxcclxuICAgICAgICAgICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgICAgICAgICAgICBidWlsZGVyUmVhZHk6IHJlYWR5LFxyXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdCdWlsZCBzZXR0aW5ncyBhcmUgbGltaXRlZCBpbiBNQ1AgcGx1Z2luIGVudmlyb25tZW50JyxcclxuICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVBY3Rpb25zOiBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdPcGVuIGJ1aWxkIHBhbmVsIHdpdGggcHJvamVjdF9idWlsZF9zeXN0ZW0gYWN0aW9uIFwib3Blbl9idWlsZF9wYW5lbFwiJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0NoZWNrIGJ1aWxkZXIgc3RhdHVzIHdpdGggcHJvamVjdF9idWlsZF9zeXN0ZW0gYWN0aW9uIFwiY2hlY2tfYnVpbGRlcl9zdGF0dXNcIidcclxuICAgICAgICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICAgICAgICAgIGxpbWl0YXRpb246ICdGdWxsIGJ1aWxkIGNvbmZpZ3VyYXRpb24gcmVxdWlyZXMgZGlyZWN0IEVkaXRvciBVSSBhY2Nlc3MnXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIG9wZW5CdWlsZFBhbmVsKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYnVpbGRlcicsICdvcGVuJyk7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ+KchSBCdWlsZCBwYW5lbCBvcGVuZWQgc3VjY2Vzc2Z1bGx5J1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBjaGVja0J1aWxkZXJTdGF0dXMoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZWFkeTogYm9vbGVhbiA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2J1aWxkZXInLCAncXVlcnktd29ya2VyLXJlYWR5Jyk7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ+KchSBCdWlsZGVyIHN0YXR1cyBjaGVja2VkIHN1Y2Nlc3NmdWxseScsXHJcbiAgICAgICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVhZHk6IHJlYWR5LFxyXG4gICAgICAgICAgICAgICAgICAgIHN0YXR1czogcmVhZHkgPyAnQnVpbGRlciB3b3JrZXIgaXMgcmVhZHknIDogJ0J1aWxkZXIgd29ya2VyIGlzIG5vdCByZWFkeSdcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxufVxyXG4iXX0=