import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { identifier, otp_code, type, password, user_data } = await req.json()

    if (!identifier || !otp_code || !type) {
      throw new Error('Identifier, otp_code, and type are required')
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Verify the OTP in the database
    const { data: otpRecord, error: fetchError } = await supabaseAdmin
      .from('custom_otps')
      .select('*')
      .eq('identifier', identifier)
      .eq('otp_code', otp_code)
      .eq('type', type)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (fetchError || !otpRecord) {
      throw new Error('Invalid or expired verification code')
    }

    // 2. Mark OTP as used
    await supabaseAdmin
      .from('custom_otps')
      .update({ used: true })
      .eq('id', otpRecord.id)

    // 3. Handle the User Flow via Supabase Admin API
    let user = null;

    if (type === 'signup') {
      // Create user automatically confirmed
      const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: identifier.includes('@') ? identifier : undefined,
        phone: !identifier.includes('@') ? identifier : undefined,
        password: password || 'EAWS_Temp_Pass_123!', // Require them to send a password
        email_confirm: true,
        phone_confirm: true,
        user_metadata: user_data || {}
      })
      if (createError) throw createError
      user = newUserData.user
    } 
    else if (type === 'reset') {
      // For password resets, update the user's password directly using Admin API
      if (!password) throw new Error('New password is required for reset')
      
      // Find user ID first
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = users.find(u => u.email === identifier || u.phone === identifier)
      if (!existingUser) throw new Error('User not found')

      const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { password: password }
      )
      if (updateError) throw updateError
      user = updatedUser.user
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Verification successful',
      user: user,
      instruction: 'Frontend should now call supabase.auth.signInWithPassword({ email, password })'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
