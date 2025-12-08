function [mCatclus] =  clusterSTEPmag(mCatalog, Mainmag, Mc, startyear, t1, t2)

% Example [mCatclus] =  clusterSTEPmag(mCatalog, 1.95, 1.95, 1984, 1, 1);

% code to cluster catalog with spatial windows according to STEP forecasting model 
% with sliding windows of t1 backwards in time and t2 forward in time
% starting with the largest earthquake in the catalog

%
% Input parameters:
%   mCatalog        Earthquake catalog
%   Mainmag         minimum mainmag magnitude
%   Mc              Completeness magnitude
%   startyear
%   t1              time before an earthquake in days
%   t2              time window following an earthquake in days
%
% Output parameters:
%   fBValue         mCatclus: The clustered catalog for further anaysis
%
% Annemarie Christophersen, 31. January 2008


% Code written for catalogue under zmap, thus the input
% catalogue is in the variable a, where
% column 1: longitude
% column 2: latitude
% column 3: year (decimal year, including seconds)
% column 4: month
% column 5: day
% column 6: magnitude
% column 7: depth
% column 8: hour
% column 9: minute
% column 10: seconds
% column 11-23 not important for clustering and cluster analysis
% column 24: SCSN flag for event type (l=local, r=regional, q=quarry)

% variables used
% mc completeness magnitude
% twindow duration in time in which to look for related events

Dtafter = t2/365; %30 days in decimal years
Dtbefore = t1/365; %2 days in decimal years
clusterno = 1;

l = mCatalog(:,6) >= Mc & mCatalog(:,3)>=startyear;
b = [ mCatalog(l,1:10) mCatalog(l,1:4)*0 ];
le = length(b(:,1));
b(:,11)= 1:le; %introduce column 11 with row number

while length(find(b(:,12)==0))>0
    vSel=find((b(:,12)==0)); %all earthquakes that have not been clustered
    maxmag=max(b(vSel,6)); %the magnitude of the largest earthquake not yet clustered
    lino= b(min(find(maxmag==(b(:,6))&b(:,12)==0)),11); %find line number in column 11
    b(lino,12)=clusterno; %write cluster number into column 12
    searchradius=max(5, 10^(0.59*maxmag-2.44)); %calculate search radius
    tref=b(lino,3); %set reference time
    latref = b(lino,2); %set reference latitude
    lonref = b(lino,1); %set reference longitude

    %search for earthquakes before, extend by sliding time windows of t1
    eventsDtbefore=(b(:,3) > tref-Dtbefore & b(:,3) < tref);
    eventsbefore = length(b(eventsDtbefore,1));
    linobefore = lino-eventsbefore;
    for i=linobefore:lino
        if (b(i,12) == 0) % don't bother if event already clustered
            edist = deg2km(distance(latref,lonref,b(i,2),b(i,1))); %calculate distance to mainshock
            if (edist <= searchradius)
                b(i,12)=clusterno;
                %make this event new tref and search for events before
                tref=b(i,3);
                eventsDtbefore=(b(:,3) > tref-Dtbefore & b(:,3) < tref);
                eventsbefore = length(b(eventsDtbefore,1));
                linobefore = max(1, i-eventsbefore);
                i=linobefore; %is this the right way to restart loop at linobefore?
            end
        end
    end %this could now have an earlier linebefore and will loop up to lino 
    % where lino remains the number of mainshoc
    % now look for later earthquakes

    tref=b(lino,3); %reset reference time to mainshock
    while (lino < le+1) && b(lino,3) < (tref+Dtafter) 
        if b(lino,12) ==0
            edist = deg2km(distance(latref,lonref,b(lino,2),b(lino,1)));
            if (edist <= searchradius)
                b(lino,12)=clusterno;
                if (b(lino,6) > Mc)
                    tref=b(lino,3); %set reference time to new earthquake in cluster
                end
            end
        end
        lino=lino+1;
    end
    clusterno=clusterno+1;
end

%Ouput clustered matrix
% column 1: longitude
% column 2: latitude
% column 3: year (decimal year, including seconds)
% column 4: month
% column 5: day
% column 6: magnitude
% column 7: depth
% column 8: hour
% column 9: minute
% column 10: seconds
% column 11: line number
% column 12: cluster number
% column 13: mainshock with its cluster number
% column 14: initiating event cluster number

b(:,6)=round(b(:,6)*10)/10;%  round magnitudes to 0.1 

%cluster number in column 13 for every mainshock and column 14 for every
%foreshock

clusterno = 1;
clustermax=max(b(:,12));

for i = 1:clustermax
    vSel=find(b(:,12)==i);
    if isempty(vSel) ~=1
        nMin =min(find(b(vSel,6)== max(b(vSel,6))));
        b(vSel(nMin),13)=clusterno; %label first largest event with clusterno
        b(vSel,12)=clusterno; %label all events of the cluster with clusterno
        b(min(find(b(:,12)==clusterno)),14)=clusterno; %label first event in column 14
        clusterno=clusterno+1;
    end
end
mCatclus=b;