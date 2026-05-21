const express = require('express');
const { supabasePublic } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/auth/signup', async (req, res, next) => {
  try {
    const { email, password, phone, metadata = {} } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        error: 'Provide email or phone, plus password',
      });
    }

    const { data, error } = await supabasePublic.auth.signUp({
      email,
      phone,
      password,
      options: {
        data: metadata,
      },
    });

    if (error) throw error;

    return res.status(201).json({
      success: true,
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/signin', async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        error: 'Provide email or phone, plus password',
      });
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      phone,
      password,
    });

    if (error) throw error;

    return res.json({
      success: true,
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/me', requireAuth, async (req, res) => {
  return res.json({
    success: true,
    user: req.authUser,
  });
});

module.exports = router;
