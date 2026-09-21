// Supabase Edge Function: delete-my-account (deployed, verify_jwt = true)
// A signed-in user deletes THEIR OWN account after re-entering their password.
//  - Staff: sign-in closed, access removed; records they created stay with the business.
//  - Owner: the whole business and every staff account are permanently deleted; the owner must also type
//    the business name. Owners of several businesses are told to contact support.
// Platform-admin accounts cannot be deleted here. See the deployed version for the full source.
