import { supabase } from '../../lib/supabase';
import { Event } from '../../types/database';

export interface MatchResult {
  exactMatch: Event | null;
  candidates: Event[];
  needsDisambiguation: boolean;
  disambiguationQuestion: string;
}

const KO_CMD_RE = /잡아줘|등록해줘|추가해줘|만들어줘|취소해줘|삭제해줘|지워줘|없애줘|바꿔줘|수정해줘|변경해줘|옮겨줘|알려줘|보여줘|해줘/g;
const KO_DATE_RE = /오늘|내일|모레|글피|이번\s*주|다음\s*주|다다음\s*주|\d+\s*일\s*(?:후|뒤)|일주일\s*(?:후|뒤)|한\s*주\s*(?:후|뒤)|\d+\s*주\s*(?:후|뒤)/g;
// 아침/점심/저녁/밤은 이벤트 제목에도 쓰이므로 제외 (예: "점심 약속", "저녁 모임")
const KO_TIME_CLEAR_RE = /오전|오후|새벽|자정|정오|\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?/g;
// 의(genitive)는 단어 내 등장이 많아 제외; 나머지 조사는 어절 끝(공백/EOL) 기준으로 제거
const KO_PARTICLE_RE = /(?<=[가-힣])[을를이가은는에서로부터까지와과도만](?=\s|$)/g;

const EMPTY: MatchResult = {
  exactMatch: null,
  candidates: [],
  needsDisambiguation: false,
  disambiguationQuestion: '',
};

export class EventMatcher {
  constructor(private readonly userId: string) {}

  async findForUpdate(query: string, dateHint?: Date): Promise<MatchResult> {
    return this.find(query, dateHint);
  }

  async findForDelete(query: string, dateHint?: Date): Promise<MatchResult> {
    return this.find(query, dateHint);
  }

  private async find(query: string, dateHint?: Date): Promise<MatchResult> {
    const keyword = this.extractKeyword(query);

    if (dateHint) {
      const dayStart = new Date(dateHint);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dateHint);
      dayEnd.setHours(23, 59, 59, 999);

      // Strategy 1: date range + keyword ilike
      if (keyword) {
        const { data } = await supabase
          .from('events')
          .select('*')
          .eq('user_id', this.userId)
          .gte('start_at', dayStart.toISOString())
          .lte('start_at', dayEnd.toISOString())
          .is('deleted_at', null)
          .ilike('title', `%${keyword}%`)
          .order('start_at', { ascending: true });

        if (data && data.length > 0) {
          return this.buildResult(data as Event[], query);
        }
      }

      // Strategy 2: date range only — score client-side by similarity
      const { data: dayData } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', this.userId)
        .gte('start_at', dayStart.toISOString())
        .lte('start_at', dayEnd.toISOString())
        .is('deleted_at', null)
        .order('start_at', { ascending: true });

      if (dayData && dayData.length > 0) {
        const ranked = (dayData as Event[])
          .map(e => ({ event: e, score: this.calculateSimilarity(query, e.title) }))
          .sort((a, b) => b.score - a.score);
        return this.buildResult(ranked.map(r => r.event), query);
      }
    }

    // Strategy 3: title-only search across next 14 days
    if (keyword) {
      const now = new Date();
      const until = new Date();
      until.setDate(until.getDate() + 14);

      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', this.userId)
        .gte('start_at', now.toISOString())
        .lte('start_at', until.toISOString())
        .is('deleted_at', null)
        .ilike('title', `%${keyword}%`)
        .order('start_at', { ascending: true });

      if (data && data.length > 0) {
        return this.buildResult(data as Event[], query);
      }
    }

    return EMPTY;
  }

  private buildResult(events: Event[], query: string): MatchResult {
    if (events.length === 0) return EMPTY;
    if (events.length === 1) {
      return {
        exactMatch: events[0],
        candidates: events,
        needsDisambiguation: false,
        disambiguationQuestion: '',
      };
    }
    const topN = events.slice(0, 4);
    return {
      exactMatch: null,
      candidates: topN,
      needsDisambiguation: true,
      disambiguationQuestion: this.buildDisambiguationQuestion(topN, query),
    };
  }

  // Exported for testability
  calculateSimilarity(query: string, title: string): number {
    const normalize = (s: string) =>
      s
        .replace(KO_CMD_RE, ' ')
        .replace(KO_DATE_RE, ' ')
        .replace(KO_TIME_CLEAR_RE, ' ')
        .replace(KO_PARTICLE_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const q = normalize(query);
    const t = normalize(title);
    if (!q || !t) return 0;
    if (t === q) return 1.0;
    if (t.includes(q)) return 0.95;
    if (q.includes(t)) return 0.9;

    const qTokens = q.split(' ').filter(Boolean);
    let matches = 0;
    for (const tok of qTokens) {
      if (t.includes(tok)) matches++;
    }
    return qTokens.length > 0 ? matches / qTokens.length : 0;
  }

  // Exported for testability
  extractKeyword(query: string): string {
    return query
      .replace(KO_CMD_RE, ' ')
      .replace(KO_DATE_RE, ' ')
      .replace(KO_TIME_CLEAR_RE, ' ')
      .replace(KO_PARTICLE_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildDisambiguationQuestion(candidates: Event[], query: string): string {
    const labels = candidates.map(e => {
      const d = new Date(e.start_at);
      const h = d.getHours();
      const m = d.getMinutes();
      const time = m > 0 ? `${h}시 ${m}분` : `${h}시`;
      return `"${e.title}"(${time})`;
    });

    // Check if query mentions 취소/삭제 to phrase appropriately
    const isDelete = /취소|삭제|지워|없애/.test(query);
    const verb = isDelete ? '취소할까요' : '수정할까요';

    if (candidates.length === 2) {
      return `일정이 2개 있어요. ${labels[0]}${verb}, ${labels[1]}${verb}?`;
    }
    const list = labels.join(', ');
    return `일정이 ${candidates.length}개 있어요. ${list} 중 어떤 일정을 ${verb.replace('까요', '하시나요')}?`;
  }
}

export const createEventMatcher = (userId: string) => new EventMatcher(userId);
