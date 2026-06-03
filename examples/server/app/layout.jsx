import "./globals.css";

export const metadata = {
  title: "Interactive AI Avatar - Server",
  description: "ZEGO AI Avatar Server API",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
