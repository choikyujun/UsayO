import { View } from 'react-native';
import { useColors } from '../constants/colors';
import { Event } from '../types/database';
import { useUpcomingEvents } from '../hooks/useUpcomingEvents';
import DateGroupSection from './DateGroupSection';

interface Props {
  allEvents:    Event[];
  onLongPress?: (event: Event) => void;
  onDelete?:    (event: Event) => void;
}

export default function UpcomingSection({ allEvents, onLongPress, onDelete }: Props) {
  const colors = useColors();
  const groups = useUpcomingEvents(allEvents);

  if (groups.length === 0) return null;

  return (
    <View>
      {groups.map(group => (
        <DateGroupSection
          key={group.date.toISOString()}
          group={group}
          colors={colors}
          onLongPress={onLongPress}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}
