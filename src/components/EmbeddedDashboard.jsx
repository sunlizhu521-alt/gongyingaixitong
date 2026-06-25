import React from 'react';
import { EMBEDDED_KCFX_PAGES } from '../constants.js';

export default function EmbeddedDashboard({
  activeTab,
  accessibleEmbeddedKcfxPages = EMBEDDED_KCFX_PAGES,
  activeEmbeddedKcfxPage,
  activeEmbeddedKcfxLoading,
  activeEmbeddedKcfxProgress,
  mountedEmbeddedKcfxPages,
  embeddedFrameReady,
  embeddedKcfxSrc,
  applyEmbeddedDashboardChrome
}) {
  if (accessibleEmbeddedKcfxPages.length === 0) return null;

  return (
    <section
      className={`embedded-dashboard-panel ${activeEmbeddedKcfxPage ? '' : 'is-background'}`}
      aria-hidden={!activeEmbeddedKcfxPage}
    >
      {activeEmbeddedKcfxPage && (
        <div className="embedded-dashboard-header">
          <h2>{activeEmbeddedKcfxPage.label}</h2>
          {activeEmbeddedKcfxLoading && (
            <span className="embedded-dashboard-status">正在加载页面内容</span>
          )}
        </div>
      )}
      <div className="embedded-dashboard-frame-stack">
        {mountedEmbeddedKcfxPages.map((page) => {
          const isActiveEmbeddedFrame = activeTab === page.tab;
          const isEmbeddedFrameReady = Boolean(embeddedFrameReady[page.tab]);
          return (
            <React.Fragment key={page.tab}>
              <iframe
                className={`embedded-dashboard-frame ${isActiveEmbeddedFrame ? 'is-active' : ''} ${isEmbeddedFrameReady ? 'is-ready' : ''}`}
                title={page.label}
                src={embeddedKcfxSrc(page)}
                data-tab={page.tab}
                loading="eager"
                onLoad={(event) => applyEmbeddedDashboardChrome(event, page.tab)}
              />
              {isActiveEmbeddedFrame && activeEmbeddedKcfxLoading && (
                <div className="embedded-dashboard-loading" role="status" aria-live="polite">
                  <div className="embedded-dashboard-loading-card">
                    <strong>{page.label}</strong>
                    <div className="embedded-dashboard-progress-row">
                      <span>读取进度</span>
                      <strong>{activeEmbeddedKcfxProgress}%</strong>
                    </div>
                    <div
                      className="embedded-dashboard-loading-bar"
                      role="progressbar"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={activeEmbeddedKcfxProgress}
                      aria-label={`${page.label}读取进度`}
                    >
                      <span style={{ width: `${activeEmbeddedKcfxProgress}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
