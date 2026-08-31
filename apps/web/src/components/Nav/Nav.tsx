import { Home, List, History, User, Shield } from 'lucide-react';
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
    { to: '/aufgaben', icon: List, label: de.nav.tasks },
    { to: '/verlauf', icon: History, label: de.nav.history },
    { to: '/ich', icon: User, label: de.nav.account },
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
        {role === 'ADMIN' && (
          <li>
            <NavLink to="/verwaltung" className={styles.link}>
              <Shield size={20} strokeWidth={1.75} aria-hidden="true" />
              <span>{de.nav.admin}</span>
            </NavLink>
          </li>
        )}
      </ul>
    </nav>
  );
}
