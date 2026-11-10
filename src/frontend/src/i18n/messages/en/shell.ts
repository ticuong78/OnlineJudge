import type { shell as vi } from '../vi/shell';
import type { Dict } from '../types';

export const shell = {
  nav: {
    home: 'Home',
    bank: 'Bank',
    classes: 'Classes',
    myClass: 'My classes',
    practice: 'Practice',
    progress: 'Progress',
    import: 'Import',
    integrity: 'Integrity',
    organizations: 'Organizations',
    submissions: 'Submissions',
    users: 'Users',
  },
  menu: 'Menu',
  signOut: 'Sign out',
} satisfies Dict<typeof vi>;
