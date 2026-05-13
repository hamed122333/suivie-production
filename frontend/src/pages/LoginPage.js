import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';
import './LoginPage.css';

const AnimatedCounter = ({ value, suffix = '' }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const target = parseFloat(value);
          const isFloat = target % 1 !== 0;
          const duration = 2000;
          const steps = 60;
          const increment = target / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(isFloat ? parseFloat(current.toFixed(1)) : Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, hasAnimated]);

  return <span ref={ref}>{count}{suffix}</span>;
};

const ParticleBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.1,
      });
    }

    let animationId;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59, 130, 246, ${p.opacity})`;
        ctx.fill();
      });
      animationId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" />;
};

const LoginPage = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const { login } = useAuth();
  const navigate = useNavigate();

  const features = [
    {
      icon: '📦',
      title: 'Allocation FIFO Automatique',
      desc: 'Le système alloue automatiquement le stock aux tâches selon leur priorité FIFO.',
    },
    {
      icon: '🔄',
      title: 'Synchronisation Temps Réel',
      desc: 'Toutes les modifications sont instantanément reflétées via SSE.',
    },
    {
      icon: '🔔',
      title: 'Alertes Intelligentes',
      desc: 'Notifications bidirectionnelles entre commerciaux et planificateurs.',
    },
  ];

  const testimonials = [
    {
      name: 'Ahmed B.',
      role: 'Directeur Production',
      text: 'Une transformation digitale complète de notre gestion de stock.',
      company: 'Groupe Plasturgie',
    },
    {
      name: 'Sonia K.',
      role: 'Planificatrice',
      text: 'Enfin un outil qui comprend notre métier. Gain de temps considérable.',
      company: 'Industrie Kairouan',
    },
    {
      name: 'Mohamed H.',
      role: 'Commercial',
      text: 'Le suivi client est devenu un jeu d\'enfant. Mes clients adorent.',
      company: 'Distribution Méditerranée',
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.login(form.email, form.password);
      login(response.data.user, response.data.token);
      navigate('/kanban');
    } catch (err) {
      setError(err.response?.data?.error || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  const scrollToLogin = () => {
    document.querySelector('.login-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="login-page">
      <ParticleBackground />
      <div className="bg-decoration">
        <div className="bg-blob"></div>
        <div className="bg-blob"></div>
      </div>

      <header className="header">
        <div className="header-content">
          <a href="/" className="header-logo">
            <img src={logo} alt="NEW BOX" />
            <span className="header-title">Suivi Production</span>
          </a>
          <nav className="header-nav">
            <a href="#features">Fonctionnalités</a>
            <a href="#stats">Statistiques</a>
            <a href="#testimonials">Témoignages</a>
            <a href="#contact">Contact</a>
          </nav>
          <button className="btn-login" onClick={scrollToLogin}>
            Connexion
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-dot"></span>
            Nouvelle version 2.0 disponible
          </div>
          <h1>
            La plateforme de gestion
            <span className="highlight">intelligente</span>
            de production
          </h1>
          <p>
            Optimisez votre chaîne de production avec notre système centralisé.
            Allocation FIFO automatique, notifications temps réel, et tableaux de bord en direct.
          </p>

          <div className="hero-actions">
            <button className="btn-primary-lg" onClick={scrollToLogin}>
              <span>Démarrer maintenant</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
            <a href="#features" className="btn-secondary-lg">
              En savoir plus
            </a>
          </div>

          <div className="trust-badges">
            <div className="trust-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>SSL Sécurisé</span>
            </div>
            <div className="trust-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <span>99.9% Uptime</span>
            </div>
            <div className="trust-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>Conforme RGPD</span>
            </div>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card-header">
            <div className="card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h2>Connexion</h2>
            <p>Accédez à votre espace de production</p>
          </div>

          {error && (
            <div className="error-message">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email professionnel</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="votre@entreprise.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Mot de passe</label>
              <div className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              <div className="forgot-password-link">
                <Link to="/forgot-password">Mot de passe oublié ?</Link>
              </div>
            </div>

            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? (
                <span className="loading-spinner"></span>
              ) : (
                <>
                  Se connecter
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>Propulsé par <strong>NEW BOX KAIROUAN</strong></p>
          </div>
        </div>
      </section>

      <section className="section" id="stats">
        <div className="section-header">
          <div className="section-tag">
            <span className="pulse-dot"></span>
            Statistiques en direct
          </div>
          <h2>Des chiffres qui parlent</h2>
          <p>Notre système est déployé sur plusieurs sites de production avec des résultats mesurables.</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🏭</div>
            <div className="stat-value"><AnimatedCounter value="14" /></div>
            <div className="stat-label">Sites actifs</div>
            <div className="stat-trend trend-up">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              </svg>
              +3 ce trimestre
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <div className="stat-value"><AnimatedCounter value="4892" /></div>
            <div className="stat-label">Tâches gérées/mois</div>
            <div className="stat-trend trend-up">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              </svg>
              +18% vs mois dernier
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-value"><AnimatedCounter value="98.4" suffix="%" /></div>
            <div className="stat-label">OEE moyen</div>
            <div className="stat-trend trend-up">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              </svg>
              Objectif: 95%
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⏱️</div>
            <div className="stat-value"><AnimatedCounter value="80" suffix="ms" /></div>
            <div className="stat-label">Latence moyenne</div>
            <div className="stat-trend trend-stable">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Temps réel
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="section-header">
          <div className="section-tag">⚡ Fonctionnalités</div>
          <h2>Tout ce dont vous avez besoin</h2>
          <p>Une solution complète pour gérer votre production du début à la fin.</p>
        </div>

        <div className="features-tabs">
          <div className="features-tab-nav">
            {features.map((f, i) => (
              <button
                key={i}
                className={`tab-btn ${activeFeature === i ? 'active' : ''}`}
                onClick={() => setActiveFeature(i)}
              >
                <span className="tab-icon">{f.icon}</span>
                {f.title}
              </button>
            ))}
          </div>

          <div className="feature-tab-content">
            <div className="feature-visual">
              <div className="feature-mockup">
                <div className="mockup-header">
                  <span className="dot red"></span>
                  <span className="dot yellow"></span>
                  <span className="dot green"></span>
                </div>
                <div className="mockup-content">
                  <div className="mockup-sidebar">
                    <div className="sidebar-item active"></div>
                    <div className="sidebar-item"></div>
                    <div className="sidebar-item"></div>
                    <div className="sidebar-item"></div>
                  </div>
                  <div className="mockup-main">
                    <div className="mockup-header-row"></div>
                    <div className="mockup-cards">
                      <div className="mockup-card"></div>
                      <div className="mockup-card"></div>
                      <div className="mockup-card"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="feature-description">
              <h3>{features[activeFeature].title}</h3>
              <p>{features[activeFeature].desc}</p>
              <ul className="feature-list">
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Intégration transparente
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Support 24/7 disponible
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Mises à jour régulières
                </li>
              </ul>
              <button className="btn-feature" onClick={scrollToLogin}>
                Essayer gratuitement
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="testimonials">
        <div className="section-header">
          <div className="section-tag">💬 Témoignages</div>
          <h2>Ce que disent nos clients</h2>
          <p>Des retours concrets de professionnels qui utilisent notre solution au quotidien.</p>
        </div>

        <div className="testimonials-grid">
          {testimonials.map((t, i) => (
            <div key={i} className="testimonial-card">
              <div className="quote-icon">"</div>
              <p className="testimonial-text">{t.text}</p>
              <div className="testimonial-author">
                <div className="author-avatar">
                  {t.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="author-info">
                  <div className="author-name">{t.name}</div>
                  <div className="author-role">{t.role} · {t.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-content">
          <h2>Prêt à transformer votre production ?</h2>
          <p>Rejoignez les entreprises qui ont déjà adopté notre solution.</p>
          <div className="cta-actions">
            <button className="btn-primary-lg" onClick={scrollToLogin}>
              Démarrer gratuitement
            </button>
            <a href="#contact" className="btn-secondary-lg btn-light">
              Contacter un expert
            </a>
          </div>
        </div>
      </section>

      <footer className="footer" id="contact">
        <div className="footer-content">
          <div className="footer-brand-section">
            <div className="footer-brand">
              <img src={logo} alt="NEW BOX" />
              <div className="footer-brand-text">
                <h3>NEW BOX KAIROUAN</h3>
                <p>Industrie 4.0 · Tunisia</p>
              </div>
            </div>
            <p className="footer-description">
              Solution industrielle de gestion de production déployée sur les sites
              de fabrication méditerranéens.
            </p>
            <div className="social-links">
              <a href="#" aria-label="LinkedIn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>
              <a href="#" aria-label="Twitter">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
            </div>
          </div>

          <div className="footer-col">
            <h4>Produit</h4>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#features">Fonctionnalités</a>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#stats">Statistiques</a>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#">Documentation</a>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#">API</a>
          </div>

          <div className="footer-col">
            <h4>Entreprise</h4>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#">À propos</a>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#">Clients</a>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#">Carrières</a>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#contact">Contact</a>
          </div>

          <div className="footer-col">
            <h4>Ressources</h4>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#">Support</a>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#">Changelog</a>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#">Sécurité</a>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a href="#">Confidentialité</a>
          </div>
        </div>

        <div className="footer-bottom">
          <div>© 2026 NEW BOX KAIROUAN · Tous droits réservés</div>
          <div className="footer-status">
            <span className="status-dot"></span>
            Tous les systèmes opérationnels
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LoginPage;
