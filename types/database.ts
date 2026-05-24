export type Database = {
  public: {
    Tables: {
      // ── 기존 (legacy) ─────────────────────────────────────────
      schedules: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          start_at: string;
          end_at: string | null;
          is_recurring: boolean;
          recurrence_rule: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          start_at: string;
          end_at?: string | null;
          is_recurring?: boolean;
          recurrence_rule?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          start_at?: string;
          end_at?: string | null;
          is_recurring?: boolean;
          recurrence_rule?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ── 신규 테이블 ───────────────────────────────────────────
      profiles: {
        Row: {
          id: string;
          name: string | null;
          avatar_url: string | null;
          plan: 'free' | 'pro' | 'team';
          plan_expires_at: string | null;
          trial_started_at: string | null;
          preferred_language: string;
          tts_speed: number;
          timezone: string;
          onboarding_done: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          avatar_url?: string | null;
          plan?: 'free' | 'pro' | 'team';
          plan_expires_at?: string | null;
          trial_started_at?: string | null;
          preferred_language?: string;
          tts_speed?: number;
          timezone?: string;
          onboarding_done?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string | null;
          avatar_url?: string | null;
          plan?: 'free' | 'pro' | 'team';
          plan_expires_at?: string | null;
          trial_started_at?: string | null;
          preferred_language?: string;
          tts_speed?: number;
          timezone?: string;
          onboarding_done?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };

      events: {
        Row: {
          id: string;
          user_id: string;
          team_id: string | null;
          title: string;
          description: string | null;
          start_at: string;
          end_at: string;
          is_all_day: boolean;
          location: string | null;
          color: string;
          category: 'work' | 'personal' | 'important';
          is_recurring: boolean;
          recurrence_rule: string | null;
          parent_event_id: string | null;
          google_event_id: string | null;
          apple_event_id: string | null;
          created_via: 'voice' | 'manual' | 'sync';
          voice_transcript: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          team_id?: string | null;
          title: string;
          description?: string | null;
          start_at: string;
          end_at: string;
          is_all_day?: boolean;
          location?: string | null;
          color?: string;
          category?: 'work' | 'personal' | 'important';
          is_recurring?: boolean;
          recurrence_rule?: string | null;
          parent_event_id?: string | null;
          google_event_id?: string | null;
          apple_event_id?: string | null;
          created_via?: 'voice' | 'manual' | 'sync';
          voice_transcript?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          team_id?: string | null;
          title?: string;
          description?: string | null;
          start_at?: string;
          end_at?: string;
          is_all_day?: boolean;
          location?: string | null;
          color?: string;
          category?: 'work' | 'personal' | 'important';
          is_recurring?: boolean;
          recurrence_rule?: string | null;
          google_event_id?: string | null;
          apple_event_id?: string | null;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      teams: {
        Row: {
          id: string;
          name: string;
          owner_id: string | null;
          plan: string;
          plan_expires_at: string | null;
          max_members: number;
          settings: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id?: string | null;
          plan?: string;
          plan_expires_at?: string | null;
          max_members?: number;
          settings?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          name?: string;
          plan?: string;
          plan_expires_at?: string | null;
          max_members?: number;
          settings?: Record<string, unknown>;
        };
        Relationships: [];
      };

      team_members: {
        Row: {
          team_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member';
          display_name: string | null;
          joined_at: string;
        };
        Insert: {
          team_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'member';
          display_name?: string | null;
          joined_at?: string;
        };
        Update: {
          role?: 'owner' | 'admin' | 'member';
          display_name?: string | null;
        };
        Relationships: [];
      };

      event_requests: {
        Row: {
          id: string;
          team_id: string | null;
          requester_id: string;
          target_user_id: string;
          title: string;
          start_at: string;
          end_at: string;
          location: string | null;
          note: string | null;
          status: 'pending' | 'approved' | 'rejected';
          event_id: string | null;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id?: string | null;
          requester_id: string;
          target_user_id: string;
          title: string;
          start_at: string;
          end_at: string;
          location?: string | null;
          note?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          event_id?: string | null;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: 'pending' | 'approved' | 'rejected';
          event_id?: string | null;
          responded_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      team_events: {
        Row: {
          id: string;
          team_id: string;
          created_by: string;
          title: string;
          description: string | null;
          start_at: string;
          end_at: string;
          location: string | null;
          scope: 'broadcast' | 'optional';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          created_by: string;
          title: string;
          description?: string | null;
          start_at: string;
          end_at: string;
          location?: string | null;
          scope?: 'broadcast' | 'optional';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          start_at?: string;
          end_at?: string;
          location?: string | null;
          scope?: 'broadcast' | 'optional';
          updated_at?: string;
        };
        Relationships: [];
      };

      team_invites: {
        Row: {
          id: string;
          team_id: string;
          invited_by: string;
          email: string;
          role: 'admin' | 'member';
          token: string;
          status: 'pending' | 'accepted' | 'expired';
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          invited_by: string;
          email: string;
          role?: 'admin' | 'member';
          token?: string;
          status?: 'pending' | 'accepted' | 'expired';
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          status?: 'pending' | 'accepted' | 'expired';
        };
        Relationships: [];
      };

      voice_logs: {
        Row: {
          id: string;
          user_id: string;
          action_type: 'create' | 'update' | 'delete' | 'query';
          intent_detected: string | null;
          confidence: number | null;
          transcript: string | null;
          audio_deleted_at: string | null;
          result_event_id: string | null;
          success: boolean | null;
          error_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action_type: 'create' | 'update' | 'delete' | 'query';
          intent_detected?: string | null;
          confidence?: number | null;
          transcript?: string | null;
          audio_deleted_at?: string | null;
          result_event_id?: string | null;
          success?: boolean | null;
          error_code?: string | null;
          created_at?: string;
        };
        Update: {
          audio_deleted_at?: string | null;
          result_event_id?: string | null;
          success?: boolean | null;
          error_code?: string | null;
        };
        Relationships: [];
      };

      user_quotas: {
        Row: {
          user_id: string;
          month: string;
          create_count: number;
          modify_count: number;
          query_count: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          month: string;
          create_count?: number;
          modify_count?: number;
          query_count?: number;
          updated_at?: string;
        };
        Update: {
          create_count?: number;
          modify_count?: number;
          query_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };

      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan: 'free' | 'pro' | 'team';
          status: 'active' | 'canceled' | 'expired' | 'trial';
          revenuecat_customer_id: string | null;
          revenuecat_entitlement: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          trial_end: string | null;
          cancel_at_period_end: boolean;
          region: string | null;
          price_local: number | null;
          currency: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan: 'free' | 'pro' | 'team';
          status?: 'active' | 'canceled' | 'expired' | 'trial';
          revenuecat_customer_id?: string | null;
          revenuecat_entitlement?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          trial_end?: string | null;
          cancel_at_period_end?: boolean;
          region?: string | null;
          price_local?: number | null;
          currency?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          plan?: 'free' | 'pro' | 'team';
          status?: 'active' | 'canceled' | 'expired' | 'trial';
          revenuecat_customer_id?: string | null;
          revenuecat_entitlement?: string | null;
          current_period_end?: string | null;
          trial_end?: string | null;
          cancel_at_period_end?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };

      calendar_integrations: {
        Row: {
          id: string;
          user_id: string;
          provider: 'google' | 'apple' | 'outlook';
          access_token: string | null;
          refresh_token: string | null;
          token_expires_at: string | null;
          calendar_id: string | null;
          sync_enabled: boolean;
          last_synced_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: 'google' | 'apple' | 'outlook';
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          calendar_id?: string | null;
          sync_enabled?: boolean;
          last_synced_at?: string | null;
          created_at?: string;
        };
        Update: {
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          calendar_id?: string | null;
          sync_enabled?: boolean;
          last_synced_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_quota: {
        Args: { p_user_id: string; p_month: string; p_action: string };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// 편의 타입 별칭
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Event = Database['public']['Tables']['events']['Row'];
export type EventInsert = Database['public']['Tables']['events']['Insert'];
export type EventUpdate = Database['public']['Tables']['events']['Update'];
export type VoiceLog = Database['public']['Tables']['voice_logs']['Row'];
export type UserQuota = Database['public']['Tables']['user_quotas']['Row'];
export type Subscription = Database['public']['Tables']['subscriptions']['Row'];
export type CalendarIntegration = Database['public']['Tables']['calendar_integrations']['Row'];
export type Team = Database['public']['Tables']['teams']['Row'];
export type TeamMember = Database['public']['Tables']['team_members']['Row'];
export type EventRequest = Database['public']['Tables']['event_requests']['Row'];
export type TeamEvent = Database['public']['Tables']['team_events']['Row'];
export type TeamInvite = Database['public']['Tables']['team_invites']['Row'];
