import './landing.css';
import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="landing-container">
      {/* Background */}
      <div className="background-image">
        <Image src="/bg.png" alt="" fill style={{objectFit: "cover"}} quality={100} priority />
        <div className="bg-overlay"></div>
      </div>



      {/* Main Content */}
      <main className="main-content">
        <div className="hero-section">
          <div className="glass-card left-card" id="project-proof">
            <h1 className="glowing-title">FairLens</h1>
            <p className="subtitle">AI-powered bias detection<br/>& audit toolkit</p>
            <div className="action-buttons">
              <Link href="/dashboard" className="primary-btn" style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none'}}>Start Audit</Link>
            </div>
          </div>
          
          <div className="right-graphic" id="lens-preview">
             <div className="magnifying-glass-wrapper">
                <div className="glass-handle">
                    <div className="handle-connector"></div>
                </div>
                <div className="magnifying-glass">
                   <div className="glass-lens">
                      <div className="candlestick-chart">
                          {/* 3 Candlesticks */}
                          <div className="candle left">
                              <div className="wick"></div>
                              <div className="body"></div>
                          </div>
                          <div className="candle mid">
                              <div className="wick"></div>
                              <div className="body"></div>
                              <div className="glow-dot top-dot"></div>
                              <div className="glow-dot bottom-dot"></div>
                          </div>
                          <div className="candle right">
                              <div className="wick"></div>
                              <div className="body"></div>
                          </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="footer-left">
          <span>Real bias audits</span>
          <span>Fairlearn mitigation</span>
        </div>
        <div className="footer-links">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/dashboard">Governance</Link>
        </div>
      </footer>
    </div>
  );
}
