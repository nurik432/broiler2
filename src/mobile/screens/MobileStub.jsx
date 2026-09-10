// src/mobile/screens/MobileStub.jsx
export default function MobileStub({ title }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center text-tg-hint">
      <div className="text-4xl mb-3">🚧</div>
      <p className="text-base font-medium text-tg-text">«{title}»</p>
      <p className="text-sm mt-1">Экран появится в следующем обновлении.</p>
    </div>
  );
}
