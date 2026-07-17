// vite.config.ts
import { defineConfig } from "file:///C:/Users/JIA/WorkBuddy/2026-06-11-17-57-11/tmall-incentive-system/client/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/JIA/WorkBuddy/2026-06-11-17-57-11/tmall-incentive-system/client/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { execSync } from "child_process";
var __vite_injected_original_dirname = "C:\\Users\\JIA\\WorkBuddy\\2026-06-11-17-57-11\\tmall-incentive-system\\client";
function getGitHash() {
  try {
    return process.env.VITE_GIT_HASH || execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}
function getBuildTime() {
  return process.env.VITE_BUILD_TIME || (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
var vite_config_default = defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(getGitHash()),
    __BUILD_TIME__: JSON.stringify(getBuildTime())
  },
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxKSUFcXFxcV29ya0J1ZGR5XFxcXDIwMjYtMDYtMTEtMTctNTctMTFcXFxcdG1hbGwtaW5jZW50aXZlLXN5c3RlbVxcXFxjbGllbnRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXEpJQVxcXFxXb3JrQnVkZHlcXFxcMjAyNi0wNi0xMS0xNy01Ny0xMVxcXFx0bWFsbC1pbmNlbnRpdmUtc3lzdGVtXFxcXGNsaWVudFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvSklBL1dvcmtCdWRkeS8yMDI2LTA2LTExLTE3LTU3LTExL3RtYWxsLWluY2VudGl2ZS1zeXN0ZW0vY2xpZW50L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCdcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnXG5cbmZ1bmN0aW9uIGdldEdpdEhhc2goKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gcHJvY2Vzcy5lbnYuVklURV9HSVRfSEFTSCB8fCBleGVjU3luYygnZ2l0IHJldi1wYXJzZSAtLXNob3J0IEhFQUQnKS50b1N0cmluZygpLnRyaW0oKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuICd1bmtub3duJztcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRCdWlsZFRpbWUoKTogc3RyaW5nIHtcbiAgcmV0dXJuIHByb2Nlc3MuZW52LlZJVEVfQlVJTERfVElNRSB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkucmVwbGFjZSgnVCcsICcgJykuc2xpY2UoMCwgMTkpICsgJyBVVEMnO1xufVxuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICBkZWZpbmU6IHtcbiAgICBfX0FQUF9WRVJTSU9OX186IEpTT04uc3RyaW5naWZ5KGdldEdpdEhhc2goKSksXG4gICAgX19CVUlMRF9USU1FX186IEpTT04uc3RyaW5naWZ5KGdldEJ1aWxkVGltZSgpKSxcbiAgfSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxuICAgIH0sXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDUxNzMsXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KSJdLAogICJtYXBwaW5ncyI6ICI7QUFBd1osU0FBUyxvQkFBb0I7QUFDcmIsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLGdCQUFnQjtBQUh6QixJQUFNLG1DQUFtQztBQUt6QyxTQUFTLGFBQXFCO0FBQzVCLE1BQUk7QUFDRixXQUFPLFFBQVEsSUFBSSxpQkFBaUIsU0FBUyw0QkFBNEIsRUFBRSxTQUFTLEVBQUUsS0FBSztBQUFBLEVBQzdGLFFBQVE7QUFDTixXQUFPO0FBQUEsRUFDVDtBQUNGO0FBRUEsU0FBUyxlQUF1QjtBQUM5QixTQUFPLFFBQVEsSUFBSSxvQkFBbUIsb0JBQUksS0FBSyxHQUFFLFlBQVksRUFBRSxRQUFRLEtBQUssR0FBRyxFQUFFLE1BQU0sR0FBRyxFQUFFLElBQUk7QUFDbEc7QUFHQSxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsUUFBUTtBQUFBLElBQ04saUJBQWlCLEtBQUssVUFBVSxXQUFXLENBQUM7QUFBQSxJQUM1QyxnQkFBZ0IsS0FBSyxVQUFVLGFBQWEsQ0FBQztBQUFBLEVBQy9DO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsUUFDTixRQUFRO0FBQUEsUUFDUixjQUFjO0FBQUEsTUFDaEI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
