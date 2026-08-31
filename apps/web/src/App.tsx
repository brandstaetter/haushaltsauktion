import { Outlet } from 'react-router';
import { StringsProvider } from './context/StringsContext';

export function App() {
  return (
    <StringsProvider>
      <Outlet />
    </StringsProvider>
  );
}
