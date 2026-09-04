import {
  Home,
  History,
  User,
  Settings,
  Users,
  ClipboardList,
  Folder,
  Gift,
  ScrollText,
  Wrench,
  ArrowLeft,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { useStrings } from '../../context/StringsContext';
import styles from './Nav.module.css';

interface NavProps {
  role: 'MEMBER' | 'ADMIN' | null;
}

const MAINTENANCE_PREFIX = '/verwaltung';

export function Nav({ role }: NavProps) {
  const { de } = useStrings();
  const { pathname } = useLocation();
  const inMaintenance = pathname.startsWith(MAINTENANCE_PREFIX);

  const mainItems = [
    { to: '/', icon: Home, label: de.nav.start },
    { to: '/verlauf', icon: History, label: de.nav.history },
    { to: '/ich', icon: User, label: de.nav.account },
  ];

  if (role === 'ADMIN') {
    mainItems.push({ to: '/verwaltung/einstellungen', icon: Wrench, label: de.nav.maintenance });
  }

  const submenuItems = [
    { to: '/verwaltung/einstellungen', icon: Settings, label: de.nav.adminSettings },
    { to: '/verwaltung/benutzer', icon: Users, label: de.nav.adminMembers },
    { to: '/verwaltung/aufgaben', icon: ClipboardList, label: de.nav.adminTasks },
    { to: '/verwaltung/kategorien', icon: Folder, label: de.nav.adminCategories },
    { to: '/verwaltung/punkte-shop', icon: Gift, label: de.nav.adminRewards },
    { to: '/verwaltung/audit-log', icon: ScrollText, label: de.nav.adminAuditLog },
    { to: '/', icon: ArrowLeft, label: de.nav.back },
  ];

  const visibleItems = role === 'ADMIN' && inMaintenance ? submenuItems : mainItems;
  // Ab 5 Spalten reicht selbst die gleichmäßige Aufteilung von §31 nicht
  // mehr für lange Labels ("Einstellungen", "Punkte-Shop") auf 390px — statt
  // sie mit Ellipsis abzuschneiden (unlesbar, siehe Decision Log), bricht die
  // Leiste dann kontrolliert in Zeilen zu je 3 Spalten um (aktuell 2 Zeilen
  // bei den 6 Einträgen des Verwaltungs-Untermenüs; bei mehr Einträgen in
  // Zukunft entsprechend mehr Zeilen).
  const grid = visibleItems.length > 4;

  return (
    <nav className={styles.nav} aria-label="Hauptnavigation">
      <ul className={grid ? `${styles.list} ${styles.grid}` : styles.list}>
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
