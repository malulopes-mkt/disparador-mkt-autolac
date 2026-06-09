import './globals.css'
import { isAuthenticated } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import LoginForm from '@/components/LoginForm'

export const metadata = {
  title: 'WhatsApp MKT — WMI Solutions',
  description: 'Ferramenta de disparos WhatsApp integrada ao HubSpot',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthenticated()

  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <div className="aurora-bg" />
        {authed ? (
          <div className="relative z-10 flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-6 overflow-auto">{children}</main>
          </div>
        ) : (
          <div className="relative z-10">
            <LoginForm />
          </div>
        )}
      </body>
    </html>
  )
}
