// T017: OAuth service with loopback server and PKCE
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use oauth2::{
    AuthorizationCode, AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, RefreshToken, Scope, TokenResponse as OAuth2TokenResponse,
    TokenUrl,
};
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;
use warp::Filter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthFlowState {
    pub auth_url: String,
    pub state: String,
    pub redirect_port: u16,
}

#[derive(Debug)]
pub struct OAuthState {
    pub pkce_verifier: PkceCodeVerifier,
    pub csrf_token: String,
    pub redirect_uri: String,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
}

// Global state for OAuth flow
lazy_static::lazy_static! {
    static ref OAUTH_STATE: Arc<Mutex<HashMap<String, OAuthState>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref OAUTH_CALLBACK: Arc<Mutex<Option<(String, String)>>> = Arc::new(Mutex::new(None)); // (code, state)
}

pub struct OAuthService;

impl OAuthService {
    /// Start OAuth flow with loopback server
    pub async fn start_oauth_flow() -> Result<OAuthFlowState, String> {
        // Find available port in range 8000-9000
        let port = Self::find_available_port(8000, 9000)
            .map_err(|e| format!("Failed to find available port: {}", e))?;

        let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

        // Get OAuth credentials from environment
        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .map_err(|_| "GOOGLE_CLIENT_ID not set in environment".to_string())?;
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .map_err(|_| "GOOGLE_CLIENT_SECRET not set in environment".to_string())?;

        // Create OAuth client
        let client = BasicClient::new(
            ClientId::new(client_id),
            Some(ClientSecret::new(client_secret)),
            AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string())
                .map_err(|e| format!("Invalid auth URL: {}", e))?,
            Some(
                TokenUrl::new("https://oauth2.googleapis.com/token".to_string())
                    .map_err(|e| format!("Invalid token URL: {}", e))?,
            ),
        )
        .set_redirect_uri(
            RedirectUrl::new(redirect_uri.clone())
                .map_err(|e| format!("Invalid redirect URI: {}", e))?,
        );

        // Generate PKCE challenge
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        // Generate CSRF token
        let csrf_token = CsrfToken::new_random();

        // Build authorization URL
        let (auth_url, _) = client
            .authorize_url(|| csrf_token.clone())
            .add_scope(Scope::new(
                "https://www.googleapis.com/auth/calendar".to_string(),
            ))
            .add_scope(Scope::new(
                "https://www.googleapis.com/auth/userinfo.email".to_string(),
            ))
            .add_extra_param("access_type", "offline")
            .add_extra_param("prompt", "consent")
            .set_pkce_challenge(pkce_challenge)
            .url();

        // Start loopback server
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let port_clone = port;
        tokio::spawn(async move {
            Self::run_loopback_server(port_clone, shutdown_rx).await;
        });

        // Store OAuth state
        let state_key = csrf_token.secret().clone();
        {
            let mut state_map = OAUTH_STATE.lock().unwrap();
            state_map.insert(
                state_key.clone(),
                OAuthState {
                    pkce_verifier,
                    csrf_token: state_key.clone(),
                    redirect_uri: redirect_uri.clone(),
                    shutdown_tx: Some(shutdown_tx),
                },
            );
        }

        // Open browser with auth URL
        Self::open_browser(&auth_url.to_string())?;

        Ok(OAuthFlowState {
            auth_url: auth_url.to_string(),
            state: csrf_token.secret().clone(),
            redirect_port: port,
        })
    }

    /// Cancel OAuth flow and cleanup
    pub async fn cancel_oauth_flow() -> Result<(), String> {
        let mut state_map = OAUTH_STATE.lock().unwrap();

        // Shutdown all active servers
        for (_, state) in state_map.drain() {
            if let Some(tx) = state.shutdown_tx {
                let _ = tx.send(());
            }
        }

        Ok(())
    }

    /// Find an available port in the given range
    fn find_available_port(start: u16, end: u16) -> Result<u16, String> {
        for port in start..=end {
            if std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
                return Ok(port);
            }
        }
        Err("No available ports in range".to_string())
    }

    /// Run loopback HTTP server
    async fn run_loopback_server(port: u16, shutdown_rx: oneshot::Receiver<()>) {
        let callback = warp::get()
            .and(warp::path("callback"))
            .and(warp::query::<HashMap<String, String>>())
            .map(|params: HashMap<String, String>| {
                if let (Some(code), Some(state)) = (params.get("code"), params.get("state")) {
                    // Store callback params for frontend to retrieve
                    println!("✓ OAuth callback received: code={}, state={}",
                        &code[..10.min(code.len())],
                        &state[..10.min(state.len())]);
                    {
                        let mut callback = OAUTH_CALLBACK.lock().unwrap();
                        *callback = Some((code.clone(), state.clone()));
                        println!("✓ OAuth callback stored in memory");
                    }

                    warp::reply::html(
                        r#"
                        <html>
                        <head><title>Authorization Successful</title></head>
                        <body>
                        <h1>Success!</h1>
                        <p>Authorization successful. You can close this window and return to the app.</p>
                        <script>window.close();</script>
                        </body>
                        </html>
                        "#,
                    )
                } else {
                    warp::reply::html(
                        r#"
                        <html>
                        <head><title>Authorization Failed</title></head>
                        <body>
                        <h1>Authorization Failed</h1>
                        <p>Please try again.</p>
                        </body>
                        </html>
                        "#,
                    )
                }
            });

        let (_, server) =
            warp::serve(callback).bind_with_graceful_shutdown(([127, 0, 0, 1], port), async {
                shutdown_rx.await.ok();
            });

        server.await;
    }

    /// Open browser with URL
    fn open_browser(url: &str) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;

        #[cfg(target_os = "linux")]
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;

        #[cfg(target_os = "windows")]
        std::process::Command::new("cmd")
            .args(&["/C", "start", url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;

        Ok(())
    }

    /// Exchange authorization code for tokens
    pub async fn exchange_code_for_tokens(
        code: String,
        state: String,
    ) -> Result<(String, Option<String>, i64), String> {
        // Validate CSRF state and retrieve PKCE verifier and redirect URI
        let (pkce_verifier, redirect_uri) = {
            let mut state_map = OAUTH_STATE.lock().unwrap();
            let oauth_state = state_map
                .remove(&state)
                .ok_or("Invalid state parameter (CSRF check failed)".to_string())?;

            // Shutdown loopback server
            if let Some(tx) = oauth_state.shutdown_tx {
                let _ = tx.send(());
            }

            (oauth_state.pkce_verifier, oauth_state.redirect_uri)
        };

        // Get OAuth credentials
        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .map_err(|_| "GOOGLE_CLIENT_ID not set".to_string())?;
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .map_err(|_| "GOOGLE_CLIENT_SECRET not set".to_string())?;

        // Create OAuth client with redirect URI
        let client = BasicClient::new(
            ClientId::new(client_id),
            Some(ClientSecret::new(client_secret)),
            AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string())
                .map_err(|e| format!("Invalid auth URL: {}", e))?,
            Some(
                TokenUrl::new("https://oauth2.googleapis.com/token".to_string())
                    .map_err(|e| format!("Invalid token URL: {}", e))?,
            ),
        )
        .set_redirect_uri(
            RedirectUrl::new(redirect_uri)
                .map_err(|e| format!("Invalid redirect URI: {}", e))?,
        );

        // Exchange code for tokens
        let token_result = client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(pkce_verifier)
            .request_async(async_http_client)
            .await
            .map_err(|e| {
                eprintln!("Token exchange error details: {:?}", e);
                format!("Failed to exchange code for tokens: {}. This usually means the authorization code expired (they expire after 10 minutes) or the redirect URI doesn't match. Error details: {}", e, e)
            })?;

        let access_token = token_result.access_token().secret().clone();
        let refresh_token = token_result
            .refresh_token()
            .map(|t| t.secret().clone());
        let expires_in = token_result
            .expires_in()
            .map(|d| d.as_secs() as i64)
            .unwrap_or(3600);

        Ok((access_token, refresh_token, expires_in))
    }

    /// Check if OAuth callback was received
    pub fn check_oauth_callback() -> Option<(String, String)> {
        let mut callback = OAUTH_CALLBACK.lock().unwrap();
        let result = callback.take(); // Take and clear
        if result.is_some() {
            println!("✓ OAuth callback retrieved and cleared");
        }
        result
    }

    /// Refresh access token using refresh token
    pub async fn refresh_access_token(
        refresh_token: String,
    ) -> Result<(String, i64), String> {
        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .map_err(|_| "GOOGLE_CLIENT_ID not set".to_string())?;
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .map_err(|_| "GOOGLE_CLIENT_SECRET not set".to_string())?;

        let client = BasicClient::new(
            ClientId::new(client_id),
            Some(ClientSecret::new(client_secret)),
            AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string())
                .map_err(|e| format!("Invalid auth URL: {}", e))?,
            Some(
                TokenUrl::new("https://oauth2.googleapis.com/token".to_string())
                    .map_err(|e| format!("Invalid token URL: {}", e))?,
            ),
        );

        let token_result = client
            .exchange_refresh_token(&RefreshToken::new(refresh_token))
            .request_async(async_http_client)
            .await
            .map_err(|e| format!("Failed to refresh token: {}. Please re-authenticate.", e))?;

        let access_token = token_result.access_token().secret().clone();
        let expires_in = token_result
            .expires_in()
            .map(|d| d.as_secs() as i64)
            .unwrap_or(3600);

        Ok((access_token, expires_in))
    }
}

// T039: Token refresh middleware
use crate::models::google_calendar::GoogleCalendarSettings;
use chrono::Utc;

/// Get a valid access token, refreshing if necessary
pub async fn get_valid_access_token(
    pool: &sqlx::SqlitePool,
) -> Result<String, String> {
    // Get current settings
    let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to query settings: {}", e))?;

    let settings = settings.ok_or("Google Calendar not configured")?;

    let access_token = settings.access_token
        .ok_or("No access token available")?;

    let refresh_token = settings.refresh_token
        .ok_or("No refresh token available")?;

    // Check if token is expired (with 5 minute buffer)
    let needs_refresh = if let Some(expires_at) = settings.token_expires_at {
        let buffer = chrono::Duration::minutes(5);
        Utc::now() + buffer >= expires_at
    } else {
        // No expiration time stored, assume it needs refresh
        false
    };

    if !needs_refresh {
        // Token is still valid
        return Ok(access_token);
    }

    // Token is expired or about to expire, refresh it
    println!("Access token expired, refreshing...");

    let (new_access_token, expires_in) = OAuthService::refresh_access_token(refresh_token).await?;

    // Calculate new expiration time
    let new_expires_at = Utc::now() + chrono::Duration::seconds(expires_in);

    // Update database with new token
    sqlx::query(
        "UPDATE google_calendar_settings
         SET access_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = 'default'"
    )
    .bind(&new_access_token)
    .bind(new_expires_at)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update access token: {}", e))?;

    println!("Access token refreshed successfully");

    Ok(new_access_token)
}
