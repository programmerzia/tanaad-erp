/** UI strings. Externalised from day one so Somali / Arabic / Luganda can be added without a rebuild. Screens import `t` and use keys as they are built out. */
export const en = {
  app: { name: 'Tanaad Management System', today: 'Today', synced: 'Synced', offline: 'Offline', pending: 'pending' },
  common: { save: 'Save', cancel: 'Cancel', done: 'Done', print: 'Print', share: 'Share on WhatsApp', close: 'Close', search: 'Search', toBeConfirmed: 'To be confirmed with the client' },
  attendance: { present: 'Present', half: 'Half day', absent: 'Absent', overtime: 'Overtime' },
  gate: { pass: 'Gate pass issued', hold: 'Gate held', override: 'Site Manager override' },
} as const;
export type Strings = typeof en;
export const t = en;
