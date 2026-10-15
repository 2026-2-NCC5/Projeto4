import { supabase } from '../../utils/supabase';

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
}

export async function signInWithFecapMicrosoft() {
  return supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile openid',
    },
  });
}

export async function signUp(params: {
  fullName: string;
  email: string;
  password: string;
  registrationNumber: string;
  program: string;
}) {
  const { fullName, email, password, registrationNumber, program } = params;
  const cleanRegistrationNumber = registrationNumber.replace(/\D/g, '');

  return supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        registration_number: cleanRegistrationNumber,
        program: program.trim(),
        role: 'student',
      },
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
}
