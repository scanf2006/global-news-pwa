import Header from '@/components/Header';
import NewsFeed from '@/components/NewsFeed';
import styles from './page.module.css';

export default function Home() {
    return (
        <>
            <Header />
            <main className={styles.main}>
                <NewsFeed />
            </main>
        </>
    );
}
