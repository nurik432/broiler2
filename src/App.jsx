// src/App.jsx
import { isTelegram } from './mobile/telegram/context';
import DesktopApp from './DesktopApp';
import TelegramApp from './mobile/TelegramApp';

export default function App() {
  return isTelegram() ? <TelegramApp /> : <DesktopApp />;
}
