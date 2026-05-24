import { supabase } from '../../lib/supabase';
import type { Team, TeamInvite, TeamMember } from '../../types/team';

export class TeamService {
  async getMyTeams(): Promise<Team[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('team_members')
      .select('team_id, teams(*)')
      .eq('user_id', user.id);

    return (data ?? [])
      .map((row: { teams: unknown }) => row.teams as Team)
      .filter(Boolean);
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();
    return data ?? null;
  }

  async createTeam(name: string): Promise<Team> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data: team, error } = await supabase
      .from('teams')
      .insert({ name, owner_id: user.id })
      .select()
      .single();
    if (error) throw error;

    // Add creator as owner
    await supabase.from('team_members').insert({
      team_id: team.id,
      user_id: user.id,
      role: 'owner',
    });

    return team;
  }

  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId);
    return data ?? [];
  }

  async addMember(teamId: string, userId: string, role: 'admin' | 'member' = 'member'): Promise<void> {
    const { error } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, user_id: userId, role });
    if (error) throw error;
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async leaveTeam(teamId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');
    await this.removeMember(teamId, user.id);
  }

  async updateMemberRole(teamId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
    const { error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('team_id', teamId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async inviteMember(teamId: string, email: string, role: 'admin' | 'member' = 'member'): Promise<TeamInvite> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data, error } = await supabase
      .from('team_invites')
      .insert({ team_id: teamId, invited_by: user.id, email, role })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async acceptInvite(token: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data: invite } = await supabase
      .from('team_invites')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!invite) throw new Error('초대 링크가 유효하지 않거나 만료됐어요.');

    await supabase.from('team_members').insert({
      team_id: invite.team_id,
      user_id: user.id,
      role: invite.role,
    });

    await supabase
      .from('team_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id);
  }
}

export const teamService = new TeamService();
