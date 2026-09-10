// src/mobile/screens/SplashScreen.jsx
import Spinner from '../components/Spinner';

export default function SplashScreen({ message = 'Загрузка…' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-tg-bg text-tg-hint">
      <Spinner size={32} />
      <p className="text-sm">{message}</p>
    </div>
  );
}
