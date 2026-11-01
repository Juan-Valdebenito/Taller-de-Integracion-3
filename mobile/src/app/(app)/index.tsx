import { Redirect } from 'expo-router';

import { useAuth } from '../../auth/AuthContext';
import { HomeScreen } from '../../screens/HomeScreen';

export default function HomeRoute() {
  const { user } = useAuth();
  const canOperate = user?.role === 'COMPANY' || user?.role === 'ADMIN';

  if (canOperate) {
    return <Redirect href="/(app)/operations" />;
  }

  return <HomeScreen />;
}
