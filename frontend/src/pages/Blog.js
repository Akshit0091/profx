import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import MarketingLayout from '../components/marketing/MarketingLayout';
import { allPosts } from '../content/posts';
import './Blog.css';

const SITE = 'https://profx.website';

export default function Blog() {
  return (
    <MarketingLayout>
      <Helmet>
        <title>ProfX Blog — Marketplace Profit Guides for Flipkart, Meesho & Amazon Sellers</title>
        <meta name="description" content="Practical guides on Flipkart settlements, Meesho returns, Amazon fees, and tracking real profit across marketplaces." />
        <link rel="canonical" href={`${SITE}/blog`} />
        <meta property="og:title" content="ProfX Blog — Marketplace Profit Guides" />
        <meta property="og:description" content="Guides on settlements, returns, fees, and real profit for Indian e-commerce sellers." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE}/blog`} />
      </Helmet>

      <section className="blog-hero">
        <div className="mk-container">
          <span className="section-eyebrow">Blog</span>
          <h1>Profit guides for marketplace sellers</h1>
          <p>How settlements, fees, and returns really work on Flipkart, Meesho, and Amazon — and how to see your true profit.</p>
        </div>
      </section>

      <section className="blog-list-section">
        <div className="mk-container">
          {allPosts.length === 0 ? (
            <p className="blog-empty">No posts yet — check back soon.</p>
          ) : (
            <div className="blog-grid">
              {allPosts.map((p) => (
                <Link key={p.slug} to={`/blog/${p.slug}`} className="blog-card">
                  <div className="blog-card-body">
                    <div className="blog-card-tags">
                      {p.tags.slice(0, 2).map((t) => <span key={t} className="blog-tag">{t}</span>)}
                    </div>
                    <h2>{p.title}</h2>
                    <p>{p.excerpt}</p>
                    <div className="blog-card-meta">
                      <span>{p.author}</span>
                      {p.date && <span>{new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}
