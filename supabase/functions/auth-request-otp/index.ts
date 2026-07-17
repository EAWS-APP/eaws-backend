import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to generate 8-character alphanumeric code
function generateAlphanumericCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Removed confusing chars like I, 1, O, 0
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { identifier, type } = await req.json() // identifier = email or phone, type = signup/login/reset

    if (!identifier || !type) {
      throw new Error('Identifier and type are required')
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Generate Code & Expiration
    const otpCode = generateAlphanumericCode()
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 15) // 15 mins expiration

    // 2. Save to database
    const { error: dbError } = await supabaseAdmin
      .from('custom_otps')
      .insert({
        identifier,
        otp_code: otpCode,
        type,
        expires_at: expiresAt.toISOString(),
      })

    if (dbError) throw dbError

    // 3. Send the OTP
    const isEmail = identifier.includes('@')
    
    if (isEmail) {
      // TODO: Replace with actual Resend/SendGrid API call
      console.log(`[MOCK EMAIL] Sending to ${identifier}: Your EAWS code is ${otpCode}`)
      // Example Resend fetch:
      // await fetch('https://api.resend.com/emails', {
      //   method: 'POST',
      //   headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ from: 'EAWS <no-reply@eaws.com>', to: identifier, subject: 'Your Verification Code', html: `<p>Code: ${otpCode}</p>` })
      // })
    } else {
      // Send SMS via Arkesel API
      const arkeselApiKey = Deno.env.get('ARKESEL_API_KEY')
      const senderId = Deno.env.get('ARKESEL_SENDER_ID') ?? 'EAWS'

      if (!arkeselApiKey) {
        console.error('Missing ARKESEL_API_KEY in Deno.env')
        throw new Error('Server configuration error for SMS')
      }

      console.log(`Sending SMS via Arkesel to ${identifier}...`)

      const arkeselRes = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
        method: 'POST',
        headers: {
          'api-key': arkeselApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: senderId,
          message: `Your EAWS verification code is: ${otpCode}. Please enter this in the app.`,
          recipients: [identifier]
        })
      })

      if (!arkeselRes.ok) {
        const errorData = await arkeselRes.text()
        console.error('Arkesel Error:', errorData)
        throw new Error('Failed to send SMS message')
      }
      
      console.log(`SMS successfully sent to ${identifier} via Arkesel`)
    }

    return new Response(JSON.stringify({ success: true, message: 'OTP Sent successfully' }), {
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
