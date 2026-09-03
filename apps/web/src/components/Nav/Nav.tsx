import { Home, History, User, Settings, Users, ClipboardList, Folder, Gift } from 'lucide-react';
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
    { to: '/verwaltung/punkte-shop', icon: Gift, label: de.nav.adminRewards },
  ];

  const visibleItems = role === 'ADMIN' ? [...items, ...adminItems] : items;

  // §31 — auf schmalen Handys reicht die Spaltenbreite ab einer gewissen
  // Eintragsanzahl (typischerweise die Admin-Nav mit 7 Einträgen) nicht mehr
  // für sichtbaren Text, egal wie kurz die Labels sind. Statt einzelne
  // Labels umbrechen zu lassen, wird die ganze Leiste dann konsequent
  // Icon-only (Text bleibt für Screenreader über den weiterhin im DOM
  // vorhandenen `<span>` erhalten, siehe `.compact` in Nav.module.css).
  const compact = visibleItems.length > 4;

  return (
    <nav className={styles.nav} aria-label="Hauptnavigation">
      <ul className={compact ? `${styles.list} ${styles.compact}` : styles.list}>
        {visibleItems.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={styles.link} end={item.to === '/'}>
              <item.icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
