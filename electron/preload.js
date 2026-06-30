const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("musicMatcher", {
  platform: process.platform,
});
