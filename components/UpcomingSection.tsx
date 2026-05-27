import { View } from 'react-native';
import { CalendarHeart } from 'lucide-react-native';
import { useColors } from '../constants/colors';
import { Event } from '../types/database';
import { useUpcomingEvents } from '../hooks/useUpcomingEvents';
import DateGroupSection from './DateGroupSection';
import EmptyState from './EmptyState';

interface Props {
  allEvents:    Event[];
  onLongPress?: (event: Event) => void;
  onDelete?:    (event: Event) => void;
  onComplete?:  (event: Event) => void;
}

export default function UpcomingSection({ allEvents, onLongPress, onDelete, onComplete }: Props) {
  const colors = useColors();
  const groups = useUpcomingEvents(allEvents);

  if (groups.length === 0) {
    return (
      <EmptyState
        Icon={CalendarHeart}
        title="다가올 일정이 없어요"
        subtitle="음성으로 빠르게 추가해보세요"
      />
    );
  }

  return (
    <View>
      {groups.map(group => (
        <DateGroupSection
          key={group.date.toISOString()}
          group={group}
          colors={colors}
          onLongPress={onLongPress}
          onDelete={onDelete}
          onComplete={onComplete}
        />
      ))}
    </View>
  );
}
