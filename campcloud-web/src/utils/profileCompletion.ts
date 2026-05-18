type ProfileCompletionInput = {
  hospitalName?: string | null;
  realName?: string | null;
  email?: string | null;
  phone?: string | null;
  wechat?: string | null;
  department?: string | null;
  title?: string | null;
};

function hasText(value?: string | null) {
  return Boolean(value && value.trim());
}

export function isProfileComplete(profile?: ProfileCompletionInput | null) {
  if (!profile) {
    return false;
  }

  return Boolean(
    hasText(profile.realName) &&
      hasText(profile.email) &&
      hasText(profile.phone) &&
      hasText(profile.wechat) &&
      hasText(profile.hospitalName) &&
      hasText(profile.department) &&
      hasText(profile.title),
  );
}
