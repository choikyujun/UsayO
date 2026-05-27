import { CalendarOff, Sun } from 'lucide-react-native';
import EmptyState from './EmptyState';

interface Props {
  isToday?: boolean;
}

export default function EmptyTodayState({ isToday = true }: Props) {
  return (
    <EmptyState
      Icon={isToday ? Sun : CalendarOff}
      title={isToday ? '오늘은 여유로워요' : '이 날은 비어있어요'}
      subtitle={isToday ? '음성으로 일정을 추가해보세요' : '꾹 눌러서 음성 입력'}
    />
  );
}
