import NewsFeed from '@/components/NewsFeed';
import Header from '@/components/Header';

export default function Home() {
  return (
    <>
      <Header />
      <main style={{ paddingTop: '6.65rem', paddingBottom: '2rem' }}>
        <NewsFeed />
      </main>
    </>
  );
}
