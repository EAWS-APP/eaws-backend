require('dotenv').config();
const { supabaseAdmin } = require('./config/supabase');

async function seed() {
  console.log('Seeding initial community feed posts...');

  // 1. Fetch user ids from seeded operator profiles
  const { data: dispatcher } = await supabaseAdmin.from('profiles').select('user_id').eq('user_role', 'dispatcher').maybeSingle();
  const { data: admin } = await supabaseAdmin.from('profiles').select('user_id').eq('user_role', 'admin').maybeSingle();
  const { data: ambulance } = await supabaseAdmin.from('profiles').select('user_id').eq('user_role', 'ambulance').maybeSingle();

  if (!dispatcher || !admin || !ambulance) {
    console.error('Error: Could not find user profiles for dispatcher, admin, or ambulance. Please run seed_operators.js first.');
    process.exit(1);
  }

  const POSTS = [
    {
      title: 'Accra Road Incident Notice',
      description: 'ALERT: Major traffic pileup on Liberation Rd near Airport Bypass. Ambulance Crews en-route. Please exercise caution and clear path.',
      category: 'ACCIDENT',
      severity: 'CRITICAL',
      location_name: 'Liberation Rd, Airport Bypass',
      latitude: 5.6053,
      longitude: -0.1868,
      is_verified: true,
      is_anonymous: false,
      reporter_id: dispatcher.user_id,
      user_id: dispatcher.user_id,
      status: 'active',
      media: {
        media_type: 'image',
        file_url: 'https://images.unsplash.com/photo-1599733589046-9b8308b5b50d?w=400&auto=format&fit=crop&q=80',
        storage_bucket: 'reports',
        storage_path: 'seed_image_1'
      }
    },
    {
      title: 'NADMO Weather Alert',
      description: 'WEATHER UPDATE: Heavy thunderstorm watch issued for Greater Accra Region. High flood risk in low-lying sectors (Amasaman, Korle Lagoon). Operational crews standby.',
      category: 'FLOOD',
      severity: 'WARNING',
      location_name: 'Accra Metropolitan',
      latitude: 5.5600,
      longitude: -0.2050,
      is_verified: true,
      is_anonymous: false,
      reporter_id: admin.user_id,
      user_id: admin.user_id,
      status: 'active',
      media: {
        media_type: 'video',
        file_url: 'https://assets.mixkit.co/videos/preview/mixkit-rain-on-a-window-sill-of-a-house-11326-large.mp4',
        storage_bucket: 'reports',
        storage_path: 'seed_video_2'
      }
    },
    {
      title: 'Medical Dispatch Log',
      description: 'Audio dispatch: Patient stable. Commencing en-route tele-med feed to Ridge ER. Dynamic vitals locked.',
      category: 'MEDICAL',
      severity: 'MEDIUM',
      location_name: 'Ridge Hospital Outer Zone',
      latitude: 5.5764,
      longitude: -0.1932,
      is_verified: true,
      is_anonymous: false,
      reporter_id: ambulance.user_id,
      user_id: ambulance.user_id,
      status: 'active',
      media: {
        media_type: 'audio',
        file_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        storage_bucket: 'reports',
        storage_path: 'seed_audio_3'
      }
    }
  ];

  for (const post of POSTS) {
    console.log(`Inserting incident: "${post.title}"...`);
    const media = post.media;
    delete post.media;

    // Check if incident already exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('incidents')
      .select('id')
      .eq('description', post.description)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing posts:', checkError);
      continue;
    }

    let incidentId;
    if (!existing) {
      const { data: newInc, error: insertError } = await supabaseAdmin
        .from('incidents')
        .insert(post)
        .select('id')
        .single();

      if (insertError) {
        console.error(`Failed to insert post: "${post.title}":`, insertError);
        continue;
      }
      incidentId = newInc.id;
      console.log(`Post created with ID: ${incidentId}`);
    } else {
      incidentId = existing.id;
      console.log(`Post already exists with ID: ${incidentId}`);
    }

    // Check and insert media
    if (media) {
      const { data: existingMedia, error: checkMediaError } = await supabaseAdmin
        .from('incident_media')
        .select('id')
        .eq('incident_id', incidentId)
        .eq('storage_path', media.storage_path)
        .maybeSingle();

      if (checkMediaError) {
        console.error('Error checking media:', checkMediaError);
        continue;
      }

      if (!existingMedia) {
        console.log(`Attaching ${media.media_type} media...`);
        const { error: mediaInsertError } = await supabaseAdmin
          .from('incident_media')
          .insert({
            incident_id: incidentId,
            uploaded_by: post.reporter_id,
            ...media
          });

        if (mediaInsertError) {
          console.error('Failed to attach media:', mediaInsertError);
        } else {
          console.log('Media attached successfully.');
        }
      } else {
        console.log('Media attachment already exists.');
      }
    }
  }

  console.log('Seeding initial community posts completed successfully.');
}

seed();
