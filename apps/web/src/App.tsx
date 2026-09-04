import { Outlet } from 'react-router';
import { StringsProvider } from './context/StringsContext';
import { VersionMismatchOverlay } from './components/VersionMismatchOverlay/VersionMismatchOverlay';

export function App() {
  return (
    <StringsProvider>
      <VersionMismatchOverlay />
      <Outlet />
    </StringsProvider>
  );
}
