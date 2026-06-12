import type { Metadata } from 'next';
import { isAuthenticated } from '@/lib/auth';
import NavBar from './components/NavBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Blog application',
};

export default async function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const authenticated = await isAuthenticated();

  return (
    <html lang="fr">
      <body className="bg-white text-slate-900 antialiased">
        <NavBar authenticated={authenticated} />
        {children}
      </body>
    </html>
  );
}
