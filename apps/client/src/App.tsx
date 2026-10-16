import { useNickname } from './lib/identity';
import { matchRoom, usePath } from './lib/router';
import { Home } from './pages/Home';
import { NicknameScreen } from './pages/NicknameScreen';
import { RoomPage } from './pages/RoomPage';

export function App() {
  const path = usePath();
  const nickname = useNickname();

  // Premier accès : on demande un pseudo avant tout, y compris en arrivant par un lien de salon.
  if (!nickname) return <NicknameScreen />;

  const roomId = matchRoom(path);
  // `key` : changer de salon recrée la page (nouvelle connexion au salon, état remis à zéro).
  if (roomId) return <RoomPage key={`${roomId}:${nickname}`} roomId={roomId} nickname={nickname} />;
  return <Home nickname={nickname} />;
}
