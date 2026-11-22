import Header from '@/components/Header';
import LiquidGlassDefs from '@/components/LiquidGlassDefs';
import NewsFeed from '@/components/NewsFeed';
import styles from './page.module.css';

export default function Home() {
    return (
        <>
            <LiquidGlassDefs />
            <Header />
            <main className={styles.main}>
                <NewsFeed />
            </main>
        </>
    );
}
