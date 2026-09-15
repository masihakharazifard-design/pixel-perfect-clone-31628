REVOKE EXECUTE ON FUNCTION public.write_audit(text, text, text, jsonb, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.before_user_created_maasmond(jsonb) FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM anon, authenticated;

CREATE POLICY "audit no insert" ON public.audit_log AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "audit no update" ON public.audit_log AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "audit no delete" ON public.audit_log AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

CREATE POLICY "docs storage update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-documents' AND public.can_plan())
WITH CHECK (bucket_id = 'project-documents' AND public.can_plan());