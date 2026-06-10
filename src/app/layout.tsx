import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata = {
  title: 'WhatsApp MKT — WMI Solutions',
  description: 'Ferramenta de disparos WhatsApp integrada ao HubSpot',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // SSO Microsoft Entra protege o app via OAuth2-Proxy.
  // Se o request chegou aqui, o usuario ja esta autenticado.
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <div className="aurora-bg" />
        <div className="relative z-10 flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  )
}
