import { Home, History, User, Settings, Users, ClipboardList, Folder } from 'lucide-react';
import { NavLink } from 'react-router';
import { useStrings } from '../../context/StringsContext';
import styles from './Nav.module.css';

interface NavProps {
  role: 'MEMBER' | 'ADMIN' | null;
}

export function Nav({ role }: NavProps) {
  const { de } = useStrings();
  const items = [
    { to: '/', icon: Home, label: de.nav.start },
    { to: '/verlauf', icon: History, label: de.nav.history },
    { to: '/ich', icon: User, label: de.nav.account },
  ];

  const adminItems = [
    { to: '/verwaltung/einstellungen', icon: Settings, label: de.nav.adminSettings },
    { to: '/verwaltung/benutzer', icon: Users, label: de.nav.adminMembers },
    { to: '/verwaltung/aufgaben', icon: ClipboardList, label: de.nav.adminTasks },
    { to: '/verwaltung/kategorien', icon: Folder, label: de.nav.adminCategories },
  ];

  return (
    <nav className={styles.nav} aria-label="Hauptnavigation">
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={styles.link} end={item.to === '/'}>
              <item.icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
        {role === 'ADMIN' &&
          adminItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={styles.link}>
                <item.icon size={20} strokeWidth={1.75} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
      </ul>
    </nav>
  );
}
