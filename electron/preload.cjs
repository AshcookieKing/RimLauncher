const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rimLauncher', {
  getMods: () => ipcRenderer.invoke('get-mods'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  createProfile: (payload) => ipcRenderer.invoke('create-profile', payload),
  getGuide: () => ipcRenderer.invoke('get-guide'),
  getEvents: () => ipcRenderer.invoke('get-events'),
  fetchDiscordData: () => ipcRenderer.invoke('fetch-discord-data'),
  getDiscordData: () => ipcRenderer.invoke('get-discord-data'),
  getDiscordUserId: (extraNames, opts) => ipcRenderer.invoke('get-discord-user-id', extraNames, opts),
  getDiscordAuthStatus: () => ipcRenderer.invoke('discord-auth-status'),
  getDiscordOAuthSetup: () => ipcRenderer.invoke('discord-oauth-setup'),
  loginDiscord: () => ipcRenderer.invoke('discord-auth-login'),
  logoutDiscord: () => ipcRenderer.invoke('discord-auth-logout'),
  prepareLaunch: () => ipcRenderer.invoke('prepare-launch'),
  subscribeMod: (id) => ipcRenderer.invoke('subscribe-mod', id),
  pickPresetFile: () => ipcRenderer.invoke('pick-preset-file'),
  resetPresetPath: () => ipcRenderer.invoke('reset-preset-path'),
  pickArmaExe: () => ipcRenderer.invoke('pick-arma-exe'),
  pickSteamLibrary: () => ipcRenderer.invoke('pick-steam-library'),
  pickWorkshopFolder: () => ipcRenderer.invoke('pick-workshop-folder'),
  saveGamePaths: (payload) => ipcRenderer.invoke('save-game-paths', payload),
  autoDetectGamePaths: (opts) => ipcRenderer.invoke('auto-detect-game-paths', opts),
  openDiscordInvite: (url) => ipcRenderer.invoke('open-discord-invite', url),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  openRpRulesWindow: () => ipcRenderer.invoke('open-rp-rules-window'),
  redeemBoosty: (payload) => ipcRenderer.invoke('redeem-boosty', payload),
  getSupportOnline: () => ipcRenderer.invoke('get-support-online'),
  getActiveTicket: (discordUserId) => ipcRenderer.invoke('get-active-ticket', discordUserId),
  createTicket: (payload) => ipcRenderer.invoke('create-ticket', payload),
  ticketMessages: (ticketId) => ipcRenderer.invoke('ticket-messages', ticketId),
  ticketSend: (ticketId, payload) => ipcRenderer.invoke('ticket-send', ticketId, payload),
  ticketClose: (ticketId, payload) => ipcRenderer.invoke('ticket-close', ticketId, payload),
  ticketRate: (ticketId, payload) => ipcRenderer.invoke('ticket-rate', ticketId, payload),
  submitSuggestion: (payload) => ipcRenderer.invoke('submit-suggestion', payload),
  createDonation: (payload) => ipcRenderer.invoke('create-donation', payload),
  getActiveDonation: (discordUserId) => ipcRenderer.invoke('get-active-donation', discordUserId),
  fetchDonationMessages: (orderId) => ipcRenderer.invoke('fetch-donation-messages', orderId),
  donationSend: (orderId, payload) => ipcRenderer.invoke('donation-send', orderId, payload),
  cancelDonation: (orderId, payload) => ipcRenderer.invoke('cancel-donation', orderId, payload),
  checkDonationPayment: (orderId, payload) => ipcRenderer.invoke('check-donation-payment', orderId, payload),
  getActiveLeaveRequest: (discordUserId) => ipcRenderer.invoke('get-active-leave', discordUserId),
  createLeaveRequest: (payload) => ipcRenderer.invoke('create-leave-request', payload),
  leaveSend: (reqId, payload) => ipcRenderer.invoke('leave-send', reqId, payload),
  getUnitList: () => ipcRenderer.invoke('get-unit-list'),
  getActiveUnitApplication: (opts) => ipcRenderer.invoke('get-active-unit-application', opts),
  createUnitApplication: (payload) => ipcRenderer.invoke('create-unit-application', payload),
  unitApplicationMessages: (appId, discordUserId) =>
    ipcRenderer.invoke('unit-application-messages', appId, discordUserId),
  unitApplicationSend: (appId, payload) => ipcRenderer.invoke('unit-application-send', appId, payload),
  withdrawUnitApplication: (appId, payload) => ipcRenderer.invoke('withdraw-unit-application', appId, payload),
  submitUnitRoleRequest: (appId, payload) => ipcRenderer.invoke('submit-unit-role-request', appId, payload),
  submitCharacterVerification: (payload) => ipcRenderer.invoke('submit-character-verification', payload),
  getCharacterVerification: () => ipcRenderer.invoke('get-character-verification'),
  selectCharacterVerification: (payload) => ipcRenderer.invoke('select-character-verification', payload),
  cancelCharacterVerification: (payload) => ipcRenderer.invoke('cancel-character-verification', payload),
  onDiscordAuthUpdated: (cb) => {
    ipcRenderer.on('discord-auth-updated', (_, data) => cb(data));
  },
  onDiscordData: (cb) => {
    ipcRenderer.on('discord-data', (_, data) => cb(data));
  },
  onLaunchProgress: (cb) => {
    ipcRenderer.on('launch-progress', (_, data) => cb(data));
  },
  onLaunchReset: (cb) => {
    ipcRenderer.on('launch-reset', () => cb());
  },
  onLaunchRunning: (cb) => {
    ipcRenderer.on('launch-running', () => cb());
  },
  onOnlineUpdate: (cb) => {
    ipcRenderer.on('online-update', (_, data) => cb(data));
  },
  onRimPointEarned: (cb) => {
    ipcRenderer.on('rim-point-earned', (_, data) => cb(data));
  },
  onUpdateAvailable: (cb) => {
    ipcRenderer.on('update-available', (_, data) => cb(data));
  },
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openUpdatePage: (url) => ipcRenderer.invoke('open-update-page', url),
  downloadUpdate: (updateInfo) => ipcRenderer.invoke('download-update', updateInfo),
  applyUpdate: (downloadedPath) => ipcRenderer.invoke('apply-update', downloadedPath),
  onUpdateDownloadProgress: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('update-download-progress', listener);
    return () => ipcRenderer.removeListener('update-download-progress', listener);
  },
  showNotification: (payload) => ipcRenderer.invoke('show-notification', payload),
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
});
