from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class MainEventInfo(BaseModel):
    """Information regarding a significant mainshock."""
    time: datetime
    magnitude: float
    name: str = "Unknown Earthquake"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    depth: Optional[float] = None
    eventID: Optional[str] = None
    
    @property
    def rupture_length_km(self) -> float:
        """
        Calculates subsurface rupture length using Wells and Coppersmith (1994)
        Log(RL) = -2.44 + 0.59 * M
        """
        return 10 ** (-2.44 + 0.59 * self.magnitude)
