import ForgotPassword from "@/components/unauthorized/forgot-password/ForgotPassword.component"

// This page uses client-side state and server actions, so it should be dynamic
export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  return (<ForgotPassword />)
}
