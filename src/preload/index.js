import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 白名单 API：界面只能通过这些通道与主进程通信，接触不到数据库和文件系统
const api = {
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    create: (payload) => ipcRenderer.invoke('categories:create', payload),
    update: (payload) => ipcRenderer.invoke('categories:update', payload),
    delete: (id) => ipcRenderer.invoke('categories:delete', id)
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    create: (payload) => ipcRenderer.invoke('accounts:create', payload),
    update: (payload) => ipcRenderer.invoke('accounts:update', payload),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id)
  },
  expenses: {
    create: (payload) => ipcRenderer.invoke('expenses:create', payload),
    update: (payload) => ipcRenderer.invoke('expenses:update', payload),
    delete: (id) => ipcRenderer.invoke('expenses:delete', id),
    list: (query) => ipcRenderer.invoke('expenses:list', query),
    summary: (payload) => ipcRenderer.invoke('expenses:summary', payload)
  },
  backup: {
    run: () => ipcRenderer.invoke('backup:run')
  },
  app: {
    getDataPath: () => ipcRenderer.invoke('app:get-data-path')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
