import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nvbmwlptadyhnijhbgwl.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52Ym13bHB0YWR5aG5pamhiZ3dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTA5MTEsImV4cCI6MjA4OTQ4NjkxMX0.oejdj6iQPxv81nxSk-ya-aPvhXJIpewHAH9HudAhfnA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
