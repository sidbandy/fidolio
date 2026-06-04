"""
SQLAlchemy models for Fidolio.

Tables:
  users            - Spotify user accounts + OAuth tokens
  tracks           - All saved tracks with Spotify audio features
  listening_history - Built by poller (last 50 plays every 30 min)
  playlists        - User playlists and track associations
  collab_rooms     - Collaborative playlist voting rooms
  automations      - Smart playlist rules
"""
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base
from pgvector.sqlalchemy import Vector

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)  # Spotify user ID
    display_name = Column(String)
    access_token = Column(String)
    refresh_token = Column(String)
    token_expiry = Column(DateTime)
    created_at = Column(DateTime)

class Track(Base):
    __tablename__ = "tracks"
    id = Column(String, primary_key=True)  # Spotify track ID
    user_id = Column(String, ForeignKey("users.id"))
    name = Column(String)
    artist = Column(String)
    album = Column(String)
    saved_at = Column(DateTime)
    tempo = Column(Float)
    energy = Column(Float)
    valence = Column(Float)
    danceability = Column(Float)
    acousticness = Column(Float)
    speechiness = Column(Float)
    loudness = Column(Float)
    duration_ms = Column(Integer)
    embedding = Column(Vector(384))  # sentence-transformers embedding for search

class ListeningHistory(Base):
    __tablename__ = "listening_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"))
    track_id = Column(String, ForeignKey("tracks.id"))
    played_at = Column(DateTime, unique=True)  # Deduplicate on this field

class CollabRoom(Base):
    __tablename__ = "collab_rooms"
    id = Column(String, primary_key=True)
    name = Column(String)
    owner_id = Column(String, ForeignKey("users.id"))
    created_at = Column(DateTime)

class Automation(Base):
    __tablename__ = "automations"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"))
    rule_json = Column(String)
    target_playlist_id = Column(String)
    active = Column(Boolean, default=True)
