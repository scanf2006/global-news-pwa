import NewsFeed from '@/components/NewsFeed';
import Header from '@/components/Header';

export default function Home() {
  return (
    <>
      <Header />
      <main style={{ paddingTop: '8.5rem', paddingBottom: '2rem' }}>
        <NewsFeed />
      </main>
    </>
  );
}
