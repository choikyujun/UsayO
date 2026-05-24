-- Fix: team_members SELECT policy caused infinite recursion (42P17)
-- The original policy queried team_members inside a team_members policy.
-- Fix: use user_id = auth.uid() directly — a user can see their own memberships.

DROP POLICY IF EXISTS "team_members: select member" ON public.team_members;

CREATE POLICY "team_members: select member"
  ON public.team_members FOR SELECT
  USING (user_id = auth.uid());
