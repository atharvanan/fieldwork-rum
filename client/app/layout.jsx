import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Fieldwork: performance and errors from real browsers',
  description: 'Real user monitoring for Core Web Vitals and JavaScript errors.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
