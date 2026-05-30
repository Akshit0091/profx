import React from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import MarketingLayout from '../components/marketing/MarketingLayout';
import { postBySlug } from '../content/posts';
import './Blog.css';

const SITE = 'https://profx.website';

export default function BlogPost() {
  const { slug } = useParams();
  const post = postBySlug(slug);

  if (!post) return <Navigate to="/blog" replace />;

  const url = `${SITE}/blog/${post.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { '@type': 'Organization', name: post.author },
    publisher: { '@type': 'Organization', name: 'ProfX', url: SITE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  return (
    <MarketingLayout>
      <Helmet>
        <title>{`${post.title} — ProfX Blog`}</title>
        <meta name="description" content={post.excerpt} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <article className="post">
        <div className="mk-container post-container">
          <Link to="/blog" className="post-back">← All posts</Link>
          <div className="post-tags">
            {post.tags.map((t) => <span key={t} className="blog-tag">{t}</span>)}
          </div>
          <h1 className="post-title">{post.title}</h1>
          <div className="post-meta">
            <span>{post.author}</span>
            {post.date && <span>· {new Date(post.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
          </div>

          <div className="post-body">
            <ReactMarkdown>{post.body}</ReactMarkdown>
          </div>

          <div className="post-cta">
            <h3>See your real profit, automatically</h3>
            <p>ProfX matches your settlements, fees, and returns across Flipkart, Meesho, and Amazon — and shows profit per order.</p>
            <Link to="/signup" className="mk-btn mk-btn-cta mk-btn-lg">Get started — from ₹599/month</Link>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
