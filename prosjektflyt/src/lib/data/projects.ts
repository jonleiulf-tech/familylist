import { createClient } from '@/lib/supabase/server';
import type { Project, ProjectMember } from '@/types/database';

export async function getUserProjects(): Promise<Project[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getProject(projectId: string): Promise<Project | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCurrentMember(projectId: string): Promise<ProjectMember | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
